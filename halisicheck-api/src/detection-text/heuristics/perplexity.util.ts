import { countWords, tokenize } from './segmentation.util.js';

/**
 * Lexical predictability — a perplexity *proxy*.
 *
 * True perplexity needs per-token log-probabilities from a language model. The
 * Mistral API does not expose logprobs, so this measures the surface features
 * that correlate with low-perplexity generated prose instead: stock connective
 * phrases, hedging without an agent, nominalisation, and promotional register.
 *
 * It is named for the signal it stands in for, not for a quantity it computes.
 * The LLM judge, not this file, carries the model-based part of the score.
 */

/** Phrases that rarely survive a human editor but recur in generated prose. */
const STOCK_PHRASES = [
  'in today\'s rapidly evolving',
  'in today\'s fast-paced',
  'it is important to note',
  'it is worth noting',
  'it should be noted',
  'plays a crucial role',
  'plays a vital role',
  'a testament to',
  'navigating the complexities',
  'in the realm of',
  'delve into',
  'delving into',
  'when it comes to',
  'at the end of the day',
  'the digital landscape',
  'ever-evolving',
  'nothing short of',
  'a wide range of',
  'a myriad of',
  'it is essential to',
  'first and foremost',
  'last but not least',
  'in conclusion',
  'to sum up',
  'unlock the potential',
  'unlocking unprecedented',
  'harness the power',
  'pave the way',
  'shed light on',
  'stakeholders',
  'leverage',
  'robust framework',
  'seamless integration',
  'cutting-edge',
  'groundbreaking',
  'revolutionise the way',
  'revolutionize the way',
  'fundamentally transformed',
  'in this ever-changing',
  'a game changer',
  'holistic approach',
  'moving forward',
];

/** Connectives that pile up when text is assembled rather than written. */
const STOCK_CONNECTIVES = [
  'furthermore', 'moreover', 'additionally', 'consequently', 'nevertheless',
  'nonetheless', 'therefore', 'thus', 'hence', 'subsequently', 'accordingly',
];

/** Hedges that state a claim while naming nobody who holds it. */
const AGENTLESS_HEDGES = [
  'various stakeholders', 'many experts', 'some argue', 'it is believed',
  'it is widely', 'studies have shown', 'research suggests', 'a number of',
  'certain considerations', 'in this space', 'among others',
];

const NOMINALISATION_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ity', 'ance', 'ence'];

export interface PredictabilityResult {
  /** 0–100, higher = more formulaic = more AI-like. */
  score: number;
  stockPhraseHits: string[];
  connectiveDensity: number;
  hedgeHits: string[];
  nominalisationRatio: number;
  reliable: boolean;
}

const MIN_WORDS = 25;

export function analysePredictability(text: string): PredictabilityResult {
  const lower = text.toLowerCase();
  const words = countWords(text);

  if (words === 0) {
    return {
      score: 50, stockPhraseHits: [], connectiveDensity: 0,
      hedgeHits: [], nominalisationRatio: 0, reliable: false,
    };
  }

  const stockPhraseHits = STOCK_PHRASES.filter((phrase) => lower.includes(phrase));
  const hedgeHits = AGENTLESS_HEDGES.filter((phrase) => lower.includes(phrase));

  const tokens = tokenize(text);
  const connectiveCount = tokens.filter((t) => STOCK_CONNECTIVES.includes(t)).length;
  // Per 100 words, so the measure does not grow with document length.
  const connectiveDensity = (connectiveCount / words) * 100;

  const nominalisations = tokens.filter(
    (t) => t.length > 6 && NOMINALISATION_SUFFIXES.some((suffix) => t.endsWith(suffix)),
  ).length;
  const nominalisationRatio = nominalisations / tokens.length;

  // Density, not raw count — otherwise long documents always look worse.
  const phraseDensity = (stockPhraseHits.length / words) * 100;
  const hedgeDensity = (hedgeHits.length / words) * 100;

  const score = Math.round(
    Math.min(
      100,
      phraseDensity * 55 +
        hedgeDensity * 40 +
        Math.min(connectiveDensity, 6) * 7 +
        Math.max(0, nominalisationRatio - 0.08) * 260,
    ),
  );

  return {
    score,
    stockPhraseHits,
    connectiveDensity: Math.round(connectiveDensity * 100) / 100,
    hedgeHits,
    nominalisationRatio: Math.round(nominalisationRatio * 1000) / 1000,
    reliable: words >= MIN_WORDS,
  };
}

/**
 * Per-sentence reasons, used to explain why a span was flagged.
 *
 * Every match is reported, not just the first of each kind: a sentence built
 * from four stock phrases is stronger evidence than one containing a single
 * phrase, and the span score is derived from how many reasons fire.
 */
export function explainSentence(text: string): string[] {
  const lower = text.toLowerCase();
  const reasons: string[] = [];

  for (const phrase of STOCK_PHRASES) {
    if (lower.includes(phrase)) reasons.push(`Stock phrase: "${phrase}"`);
  }

  // Deliberately not a constructed RegExp. `\b` inside a template literal is
  // the backspace escape rather than a word boundary, which silently yields a
  // pattern that can never match; comparing the first token avoids the hazard
  // entirely.
  const firstToken = tokenize(text)[0];
  if (firstToken !== undefined && STOCK_CONNECTIVES.includes(firstToken)) {
    reasons.push(`Opens with stock connective "${firstToken}"`);
  }

  for (const hedge of AGENTLESS_HEDGES) {
    if (lower.includes(hedge)) reasons.push(`Agentless hedging: "${hedge}"`);
  }

  return reasons;
}
