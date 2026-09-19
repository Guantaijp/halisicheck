import { describe, expect, it } from 'vitest';
import {
  countWords,
  splitParagraphs,
  splitSentences,
} from './segmentation.util.js';
import { analyseBurstiness } from './burstiness.util.js';
import { analyseRepetition } from './repetition.util.js';
import { analysePredictability, explainSentence } from './perplexity.util.js';

const HUMAN = `Mobile money did not arrive in Kenya as a finished idea. It began as a small pilot for repaying microfinance loans, and the people running it were surprised by what users actually did with it — they started sending money home instead.

The numbers are large. By 2023 the value moved through mobile money in a single year was worth more than half the country's GDP, though that figure double-counts heavily and economists argue about what it really measures. Agent liquidity is a real constraint: a rural agent who runs out of float simply cannot pay out, and the customer walks.`;

const GENERATED = `In today's rapidly evolving digital landscape, it is important to note that mobile money has fundamentally transformed the financial inclusion ecosystem. This groundbreaking innovation has revolutionised the way individuals and businesses interact with financial services.

Furthermore, it is worth noting that the adoption rate has been nothing short of remarkable. Additionally, various stakeholders have raised concerns regarding a number of important considerations in this space. Moreover, the implementation of robust frameworks plays a crucial role in navigating the complexities of this domain.`;

describe('segmentation', () => {
  it('reproduces the source text exactly when sentences are rejoined', () => {
    const sentences = splitSentences(HUMAN);
    // Paragraph separators belong to no sentence, so join across the gap.
    const rejoined = sentences.map((s) => HUMAN.slice(s.start, s.end)).join(' ');
    expect(rejoined.replace(/\s+/g, ' ').trim()).toBe(
      HUMAN.replace(/\s+/g, ' ').trim(),
    );
  });

  it('reports offsets that match the sentence text', () => {
    for (const sentence of splitSentences(GENERATED)) {
      expect(GENERATED.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });

  it('does not split on decimals, initials or abbreviations', () => {
    const text = 'Dr. J. Smith paid 3.5 million e.g. last year. Then he left.';
    expect(splitSentences(text)).toHaveLength(2);
  });

  it('splits paragraphs on blank lines', () => {
    expect(splitParagraphs(HUMAN)).toHaveLength(2);
  });

  it('handles empty and whitespace-only input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   \n\n  ')).toEqual([]);
    expect(countWords('')).toBe(0);
  });
});

describe('burstiness', () => {
  it('scores uniform sentence lengths higher than varied ones', () => {
    const human = analyseBurstiness(splitSentences(HUMAN));
    const generated = analyseBurstiness(splitSentences(GENERATED));
    expect(generated.score).toBeGreaterThan(human.score);
  });

  it('marks short samples unreliable rather than guessing', () => {
    const result = analyseBurstiness(splitSentences('One sentence only.'));
    expect(result.reliable).toBe(false);
  });

  it('returns a neutral score for empty input', () => {
    expect(analyseBurstiness([]).score).toBe(50);
  });
});

describe('repetition', () => {
  // Exact recurrence needs volume, so the ordering assertion uses a passage
  // long enough for the signal to be meaningful.
  const REPETITIVE = `${GENERATED}

${GENERATED.replace(/mobile money/g, 'digital payments')}`;

  it('scores exact recurrence higher than varied prose', () => {
    const human = analyseRepetition(HUMAN, splitSentences(HUMAN));
    const repetitive = analyseRepetition(REPETITIVE, splitSentences(REPETITIVE));
    expect(repetitive.score).toBeGreaterThan(human.score);
  });

  it('reports itself unreliable on passages too short to measure', () => {
    const short = analyseRepetition(GENERATED, splitSentences(GENERATED));
    expect(short.reliable).toBe(false);
  });

  it('detects the repeated phrases it scored on', () => {
    const repetitive = analyseRepetition(REPETITIVE, splitSentences(REPETITIVE));
    expect(repetitive.topRepeatedPhrases.length).toBeGreaterThan(0);
  });

  it('keeps every ratio within 0..1', () => {
    const r = analyseRepetition(GENERATED, splitSentences(GENERATED));
    for (const v of [r.repeatedNgramRatio, r.typeTokenRatio]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('predictability', () => {
  it('separates formulaic prose from plain prose', () => {
    const human = analysePredictability(HUMAN);
    const generated = analysePredictability(GENERATED);
    expect(generated.score).toBeGreaterThan(human.score);
    expect(generated.stockPhraseHits.length).toBeGreaterThan(2);
    expect(human.stockPhraseHits.length).toBe(0);
  });

  it('clamps to 0..100 on pathological input', () => {
    const spam = 'it is important to note '.repeat(200);
    expect(analysePredictability(spam).score).toBeLessThanOrEqual(100);
    expect(analysePredictability(spam).score).toBeGreaterThanOrEqual(0);
  });

  it('explains why a sentence was flagged', () => {
    const reasons = explainSentence(
      'Furthermore, it is worth noting that various stakeholders agree.',
    );
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('detects a stock connective in the opening position', () => {
    // Regression: this was built with `` inside a template literal, which is
    // the backspace escape, so the check silently never matched.
    for (const opener of ['Furthermore', 'Additionally', 'Moreover', 'Therefore']) {
      const reasons = explainSentence(`${opener}, the figures speak for themselves.`);
      expect(
        reasons.some((r) => r.includes('stock connective')),
        `expected "${opener}" to be detected as a stock connective`,
      ).toBe(true);
    }
  });

  it('does not flag a connective that appears mid-sentence', () => {
    const reasons = explainSentence('The report is therefore ready for review.');
    expect(reasons.some((r) => r.includes('stock connective'))).toBe(false);
  });

  it('counts every stock phrase, not just the first', () => {
    const two = explainSentence(
      "In today's rapidly evolving digital landscape, it is important to note that costs rose.",
    );
    expect(two.filter((r) => r.startsWith('Stock phrase')).length).toBeGreaterThanOrEqual(2);
  });

  it('finds nothing to explain in plain prose', () => {
    expect(explainSentence('The agent ran out of float and the customer left.')).toEqual([]);
  });
});
