import { describe, expect, it } from 'vitest';
import { assessFidelity } from './fidelity.util.js';

const ORIGINAL =
  'Mobile money has transformed financial inclusion across the African continent. Various stakeholders have raised concerns regarding important considerations in this space.';

describe('assessFidelity', () => {
  it('reports a faithful paraphrase as low risk', () => {
    const r = assessFidelity(
      ORIGINAL,
      'Mobile money has transformed financial inclusion across Africa. Stakeholders have raised concerns about important considerations here.',
    );
    expect(r.riskScore).toBeLessThan(40);
    expect(r.introducedNumbers).toEqual([]);
  });

  it('flags invented figures, which read as fact', () => {
    const r = assessFidelity(
      ORIGINAL,
      'Mobile money has transformed financial inclusion. A decade ago 400 million people lacked accounts.',
    );
    expect(r.introducedNumbers).toContain('400');
    expect(r.warnings.some((w) => /Figures appear/.test(w))).toBe(true);
    expect(r.riskScore).toBeGreaterThan(30);
  });

  it('flags heavy compression', () => {
    const r = assessFidelity(ORIGINAL, 'Mobile money changed things.');
    expect(r.lengthRatio).toBeLessThan(0.6);
    expect(r.warnings.some((w) => /shorter/.test(w))).toBe(true);
  });

  it('flags padding', () => {
    const r = assessFidelity(
      'Mobile money changed things.',
      ORIGINAL + ' ' + ORIGINAL,
    );
    expect(r.lengthRatio).toBeGreaterThan(1.5);
    expect(r.warnings.some((w) => /longer/.test(w))).toBe(true);
  });

  it('does not count ordinary inflection as invention', () => {
    const r = assessFidelity(
      'The regulator transforms the market.',
      'The regulators transformed the markets.',
    );
    expect(r.introducedTerms).toEqual([]);
  });

  it('does not count stop words or short words as invention', () => {
    const r = assessFidelity('Mobile money changed banking.', 'It was the banking that money changed.');
    expect(r.introducedTerms).toEqual([]);
  });

  it('reports terms genuinely absent from the original', () => {
    const r = assessFidelity(ORIGINAL, 'Mobile money helped farmers and hospitals in Nairobi.');
    expect(r.introducedTerms).toEqual(
      expect.arrayContaining(['farmers', 'hospitals', 'nairobi']),
    );
  });

  it('treats an identical rewrite as perfectly faithful', () => {
    const r = assessFidelity(ORIGINAL, ORIGINAL);
    expect(r.lengthRatio).toBe(1);
    expect(r.introducedTerms).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.riskScore).toBe(0);
  });

  it('handles empty input without dividing by zero', () => {
    expect(() => assessFidelity('', 'something')).not.toThrow();
    expect(() => assessFidelity('something', '')).not.toThrow();
  });
});

describe('assessFidelity — number matching', () => {
  it('does not report a figure as invented because of trailing punctuation', () => {
    // Regression: "2011," did not match "2011", so every figure beside a
    // comma was reported as fabricated.
    const original = 'Four buildings, built 2011, insured since 2019 for $3,500,000 each.';
    const rewritten = 'The four buildings went up in 2011. They have been insured since 2019, at $3,500,000 apiece.';
    expect(assessFidelity(original, rewritten).introducedNumbers).toEqual([]);
  });

  it('still catches a genuinely new figure', () => {
    const r = assessFidelity('Built 2011.', 'Built 2011, and worth $12,400,000 today.');
    expect(r.introducedNumbers).toContain('12,400,000');
  });

  it('handles a figure at the very end of the text', () => {
    expect(assessFidelity('Total is 486,300.', 'The total comes to 486,300.').introducedNumbers).toEqual([]);
  });
});
