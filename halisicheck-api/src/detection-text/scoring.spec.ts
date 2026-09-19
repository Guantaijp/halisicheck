import { describe, expect, it } from 'vitest';
import { bandForScore, combineSignals, type SignalInput } from './scoring.util.js';

const THRESHOLDS = { noticeThreshold: 40, reviewThreshold: 70 };

function signal(over: Partial<SignalInput> = {}): SignalInput {
  return {
    id: 'x', label: 'X', description: '', value: 50, weight: 1, reliable: true,
    ...over,
  };
}

describe('bandForScore', () => {
  it('maps scores onto bands at the configured thresholds', () => {
    expect(bandForScore(0, THRESHOLDS)).toBe('low');
    expect(bandForScore(39, THRESHOLDS)).toBe('low');
    expect(bandForScore(40, THRESHOLDS)).toBe('medium');
    expect(bandForScore(69, THRESHOLDS)).toBe('medium');
    expect(bandForScore(70, THRESHOLDS)).toBe('high');
    expect(bandForScore(100, THRESHOLDS)).toBe('high');
  });
});

describe('combineSignals', () => {
  it('returns a weighted mean of agreeing signals', () => {
    const result = combineSignals(
      [signal({ value: 80, weight: 3 }), signal({ value: 60, weight: 1 })],
      THRESHOLDS,
    );
    expect(result.score).toBe(75);
  });

  it('widens the interval when signals disagree', () => {
    const agree = combineSignals(
      [signal({ value: 70 }), signal({ value: 72 })],
      THRESHOLDS,
    );
    const disagree = combineSignals(
      [signal({ value: 10 }), signal({ value: 95 })],
      THRESHOLDS,
    );
    expect(disagree.confidenceMargin).toBeGreaterThan(agree.confidenceMargin);
  });

  it('widens the interval when weight rests on unreliable signals', () => {
    const reliable = combineSignals([signal({ value: 80 })], THRESHOLDS);
    const unreliable = combineSignals(
      [signal({ value: 80, reliable: false })],
      THRESHOLDS,
    );
    expect(unreliable.confidenceMargin).toBeGreaterThan(reliable.confidenceMargin);
  });

  it('down-weights unreliable signals rather than dropping them', () => {
    const result = combineSignals(
      [signal({ id: 'a', value: 100, reliable: false }), signal({ id: 'b', value: 0 })],
      THRESHOLDS,
    );
    // The unreliable signal still moves the score, but less than half way.
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(50);
  });

  it('always reports a non-zero interval', () => {
    const result = combineSignals([signal({ value: 50 }), signal({ value: 50 })], THRESHOLDS);
    expect(result.confidenceMargin).toBeGreaterThanOrEqual(5);
  });

  it('keeps effective weights summing to one', () => {
    const result = combineSignals(
      [signal({ id: 'a', weight: 2 }), signal({ id: 'b', weight: 1, reliable: false })],
      THRESHOLDS,
    );
    const total = result.signals.reduce((s, x) => s + x.effectiveWeight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('degrades to a neutral, maximally uncertain result with no signals', () => {
    const result = combineSignals([], THRESHOLDS);
    expect(result.score).toBe(50);
    expect(result.confidenceMargin).toBe(25);
  });

  it('clamps the score to 0..100', () => {
    expect(combineSignals([signal({ value: 500 })], THRESHOLDS).score).toBe(100);
    expect(combineSignals([signal({ value: -20 })], THRESHOLDS).score).toBe(0);
  });
});
