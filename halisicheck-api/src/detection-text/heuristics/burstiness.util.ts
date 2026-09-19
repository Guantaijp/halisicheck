import type { Sentence } from './segmentation.util.js';

export interface BurstinessResult {
  /** 0–100, higher = more uniform = more AI-like. */
  score: number;
  meanLength: number;
  stdDev: number;
  /** stdDev / mean. Human prose typically sits around 0.5–0.8. */
  coefficientOfVariation: number;
  sampleSize: number;
  /** False when there is too little text for the signal to mean anything. */
  reliable: boolean;
}

/**
 * Burstiness: how much sentence length varies across a passage.
 *
 * Human writing swings between long and short sentences; generated text tends
 * to even out. We measure the coefficient of variation (stdDev / mean), which
 * is scale-free, so a passage of long sentences and one of short sentences are
 * judged on variation rather than absolute length.
 */
const HUMAN_TYPICAL_CV = 0.7;
const MIN_SENTENCES = 4;

export function analyseBurstiness(sentences: Sentence[]): BurstinessResult {
  const lengths = sentences.map((s) => s.wordCount).filter((n) => n > 0);
  const sampleSize = lengths.length;

  if (sampleSize === 0) {
    return {
      score: 50, meanLength: 0, stdDev: 0, coefficientOfVariation: 0,
      sampleSize: 0, reliable: false,
    };
  }

  const mean = lengths.reduce((sum, n) => sum + n, 0) / sampleSize;
  const variance =
    lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / sampleSize;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  // Uniformity maps linearly onto the score: CV at or above the human
  // baseline scores 0, CV of 0 (perfectly uniform) scores 100.
  const uniformity = Math.max(0, Math.min(1, 1 - cv / HUMAN_TYPICAL_CV));
  const score = Math.round(uniformity * 100);

  return {
    score,
    meanLength: round(mean),
    stdDev: round(stdDev),
    coefficientOfVariation: round(cv),
    sampleSize,
    // Under a handful of sentences the variance estimate is noise.
    reliable: sampleSize >= MIN_SENTENCES,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
