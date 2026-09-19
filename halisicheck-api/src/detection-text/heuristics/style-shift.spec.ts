import { describe, expect, it } from 'vitest';
import { analyseStyleShift } from './style-shift.util.js';

/** One voice throughout: short, uneven, concrete. */
const CONSISTENT_HUMAN = [
  'Mobile money did not arrive here as a finished idea. It began as a pilot for repaying small loans, and the people running it were surprised by what users actually did with it.',
  'The numbers are large. By 2023 the value moved in a single year was worth more than half the GDP, though that figure double-counts badly and economists argue about what it measures at all.',
  'Agent liquidity is the real constraint. A rural agent who runs out of float cannot pay out. The customer walks. That is the whole problem in one sentence.',
  'Regulation followed the product rather than leading it. The Central Bank let the pilot run without a full licence. In hindsight that looks visionary. At the time it was a gamble.',
].join('\n\n');

/** One voice throughout: long, even, abstract. */
const CONSISTENT_MACHINE = [
  'In the contemporary financial landscape, mobile money platforms have fundamentally transformed the mechanisms through which individuals access economic services across the region.',
  'These technological innovations have facilitated unprecedented improvements in financial inclusion metrics, enabling previously underserved populations to participate in formal economic activity.',
  'Regulatory frameworks have subsequently evolved to accommodate these developments, establishing supervisory mechanisms that balance innovation against consumer protection imperatives.',
  'Stakeholders across the ecosystem continue to evaluate the implications of these transformations for long-term financial stability and equitable economic development outcomes.',
].join('\n\n');

/** Human opening and close, generated middle — the common real case. */
const MIXED = [
  'Mobile money did not arrive here as a finished idea. It began as a pilot for repaying small loans, and the people running it were surprised by what users did with it.',
  'In the contemporary financial landscape, mobile money platforms have fundamentally transformed the mechanisms through which individuals access economic services, facilitating unprecedented improvements in financial inclusion metrics across previously underserved demographic populations.',
  'These technological innovations have subsequently enabled regulatory frameworks to evolve, establishing comprehensive supervisory mechanisms that balance continued innovation against essential consumer protection imperatives throughout the broader financial ecosystem.',
  'Agent liquidity is the real constraint. A rural agent who runs out of float cannot pay out. The customer walks. That is the whole problem.',
].join('\n\n');

describe('analyseStyleShift', () => {
  it('scores a mixed document above a consistent one', () => {
    const mixed = analyseStyleShift(MIXED);
    const human = analyseStyleShift(CONSISTENT_HUMAN);
    const machine = analyseStyleShift(CONSISTENT_MACHINE);

    expect(mixed.score).toBeGreaterThan(human.score);
    expect(mixed.score).toBeGreaterThan(machine.score);
  });

  it('locates the boundary in a mixed document', () => {
    const r = analyseStyleShift(MIXED);
    expect(r.boundary).not.toBeNull();
    expect(r.boundary!.atOffset).toBeGreaterThan(0);
    expect(MIXED.slice(r.boundary!.atOffset, r.boundary!.atOffset + 20)).toMatch(
      /In the contemporary|These technological|Agent liquidity/,
    );
  });

  it('does not flag a boundary in consistently human writing', () => {
    expect(analyseStyleShift(CONSISTENT_HUMAN).boundary).toBeNull();
  });

  it('does not flag a boundary in consistently generated writing', () => {
    // Uniformity is not a style shift. This signal answers a different
    // question from the others and must not double-count theirs.
    expect(analyseStyleShift(CONSISTENT_MACHINE).boundary).toBeNull();
  });

  it('says plainly that it cannot tell which half is which', () => {
    const r = analyseStyleShift(MIXED);
    expect(r.summary).toMatch(/does not say which part/i);
  });

  it('reports itself unreliable on documents too short to compare', () => {
    const r = analyseStyleShift('One paragraph only, and not a long one at that.');
    expect(r.reliable).toBe(false);
    expect(r.score).toBe(0);
    expect(r.boundary).toBeNull();
  });

  it('ignores paragraphs too short to profile', () => {
    const r = analyseStyleShift(`${CONSISTENT_HUMAN}\n\nOK.\n\nSure.`);
    expect(r.segments.every((s) => s.preview.length > 10)).toBe(true);
  });

  it('keeps the score within 0..100', () => {
    for (const text of [MIXED, CONSISTENT_HUMAN, CONSISTENT_MACHINE, '']) {
      const r = analyseStyleShift(text);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('handles empty and whitespace input', () => {
    expect(() => analyseStyleShift('')).not.toThrow();
    expect(() => analyseStyleShift('   \n\n   ')).not.toThrow();
  });
});
