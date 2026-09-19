import type { VerdictLabel } from './entities/detection-result.entity.js';

export interface SignalInput {
  id: string;
  label: string;
  description: string;
  /** 0–100. */
  value: number;
  /** Relative weight before reliability adjustment. */
  weight: number;
  /** Unreliable signals are down-weighted, not dropped silently. */
  reliable: boolean;
}

export interface ScoredSignal extends SignalInput {
  /** Weight actually applied, after reliability adjustment and renormalising. */
  effectiveWeight: number;
}

export interface EnsembleResult {
  score: number;
  confidenceMargin: number;
  band: VerdictLabel;
  signals: ScoredSignal[];
}

/** Weight retained by a signal that reports itself unreliable. */
const UNRELIABLE_FACTOR = 0.35;

/** Interval half-width when signals agree perfectly and all are reliable. */
const MIN_MARGIN = 5;
const MAX_MARGIN = 25;

export function bandForScore(
  score: number,
  thresholds: { noticeThreshold: number; reviewThreshold: number },
): VerdictLabel {
  if (score >= thresholds.reviewThreshold) return 'high';
  if (score >= thresholds.noticeThreshold) return 'medium';
  return 'low';
}

/**
 * Combines signals into one score plus an honest confidence interval.
 *
 * The interval is the point of this function. It widens with disagreement
 * between signals and with how much weight sits on unreliable ones, so a
 * score built from thin evidence cannot present itself as a firm number.
 */
export function combineSignals(
  signals: SignalInput[],
  thresholds: { noticeThreshold: number; reviewThreshold: number },
): EnsembleResult {
  if (signals.length === 0) {
    return { score: 50, confidenceMargin: MAX_MARGIN, band: 'medium', signals: [] };
  }

  const adjusted = signals.map((signal) => ({
    ...signal,
    adjustedWeight: signal.weight * (signal.reliable ? 1 : UNRELIABLE_FACTOR),
  }));

  const totalWeight = adjusted.reduce((sum, s) => sum + s.adjustedWeight, 0);
  if (totalWeight === 0) {
    return { score: 50, confidenceMargin: MAX_MARGIN, band: 'medium', signals: [] };
  }

  const scored: ScoredSignal[] = adjusted.map((signal) => ({
    id: signal.id,
    label: signal.label,
    description: signal.description,
    value: signal.value,
    weight: signal.weight,
    reliable: signal.reliable,
    effectiveWeight: round(signal.adjustedWeight / totalWeight),
  }));

  const score =
    adjusted.reduce((sum, s) => sum + s.value * s.adjustedWeight, 0) / totalWeight;

  // Weighted spread of the signals around the combined score.
  const variance =
    adjusted.reduce((sum, s) => sum + s.adjustedWeight * (s.value - score) ** 2, 0) /
    totalWeight;
  const spread = Math.sqrt(variance);

  // Share of weight resting on signals that flagged themselves unreliable.
  const unreliableShare =
    adjusted
      .filter((s) => !s.reliable)
      .reduce((sum, s) => sum + s.adjustedWeight, 0) / totalWeight;

  const margin = Math.max(
    MIN_MARGIN,
    Math.min(MAX_MARGIN, spread * 0.5 + unreliableShare * 18 + MIN_MARGIN),
  );

  const rounded = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score: rounded,
    confidenceMargin: Math.round(margin),
    band: bandForScore(rounded, thresholds),
    signals: scored,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
