import { tokenize, type Sentence } from './segmentation.util.js';

export interface RepetitionResult {
  /** 0–100, higher = more repetitive = more AI-like. */
  score: number;
  /** Share of 4-grams that occur more than once. */
  repeatedNgramRatio: number;
  /** Share of sentences that open with the same first two words as another. */
  repeatedOpenerRatio: number;
  /** Distinct tokens / total tokens. Low variety reads as generated. */
  typeTokenRatio: number;
  topRepeatedPhrases: string[];
  reliable: boolean;
}

const NGRAM_SIZE = 4;
// Exact-repeat statistics are noise below roughly this length: a 90-word
// passage can be thoroughly formulaic without repeating a single 4-gram.
// Below the floor the signal reports itself unreliable and the combiner
// down-weights it, rather than contributing a confident zero.
const MIN_TOKENS = 120;

/**
 * Recurring *structure*: repeated n-grams, repeated sentence openers, and low
 * lexical variety.
 *
 * Scoped deliberately to exact recurrence. Stock connectives and formulaic
 * word choice belong to the predictability signal — counting them here too
 * would let one piece of evidence inflate two supposedly independent signals.
 */
export function analyseRepetition(
  text: string,
  sentences: Sentence[],
): RepetitionResult {
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return {
      score: 50, repeatedNgramRatio: 0, repeatedOpenerRatio: 0,
      typeTokenRatio: 0, topRepeatedPhrases: [], reliable: false,
    };
  }

  const counts = new Map<string, number>();
  for (let i = 0; i + NGRAM_SIZE <= tokens.length; i++) {
    const gram = tokens.slice(i, i + NGRAM_SIZE).join(' ');
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  const totalGrams = Math.max(1, counts.size);
  const repeated = [...counts.entries()].filter(([, n]) => n > 1);
  const repeatedNgramRatio = repeated.length / totalGrams;

  const topRepeatedPhrases = repeated
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gram]) => gram);

  // Sentence openers: "In addition, …", "Furthermore, …" used repeatedly.
  const openers = new Map<string, number>();
  for (const sentence of sentences) {
    const opener = tokenize(sentence.text).slice(0, 2).join(' ');
    if (opener.length === 0) continue;
    openers.set(opener, (openers.get(opener) ?? 0) + 1);
  }
  const repeatedOpeners = [...openers.values()].filter((n) => n > 1);
  const repeatedOpenerRatio =
    sentences.length > 0
      ? repeatedOpeners.reduce((sum, n) => sum + n, 0) / sentences.length
      : 0;

  const typeTokenRatio = new Set(tokens).size / tokens.length;

  // Type-token ratio falls naturally as texts get longer, so compare against a
  // length-adjusted expectation rather than a flat threshold.
  const expectedTtr = Math.max(0.25, 0.85 - Math.log10(tokens.length) * 0.15);
  const varietyPenalty = Math.max(0, (expectedTtr - typeTokenRatio) / expectedTtr);

  const score = Math.round(
    Math.min(
      100,
      repeatedNgramRatio * 180 + repeatedOpenerRatio * 90 + varietyPenalty * 70,
    ),
  );

  return {
    score,
    repeatedNgramRatio: round(repeatedNgramRatio),
    repeatedOpenerRatio: round(repeatedOpenerRatio),
    typeTokenRatio: round(typeTokenRatio),
    topRepeatedPhrases,
    reliable: tokens.length >= MIN_TOKENS,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
