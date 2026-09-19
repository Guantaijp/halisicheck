import { describe, expect, it } from 'vitest';
import { countParagraphs, reassemble, splitIntoBlocks } from './chunking.util.js';

const PROSE =
  'Mobile money did not arrive here as a finished idea. It began as a pilot for repaying small loans, and the people running it were surprised by what users actually did with it.';

/** Shaped like the document that exposed the original bug. */
const STRUCTURED = [
  'World Plan: Wren Hollow Apartments Hail Claim - Appraisal Award and Policy-Period Dispute',
  'Submission date: 09/11/2026',
  'World Setup',
  'Jurisdiction and line: Texas.',
  PROSE,
  'Setting and specialty: First-party commercial property claims adjusting at Cordova Plains Insurance Company, a fictional Texas carrier operating from its Dallas-Fort Worth regional claims office, where the primary handler is a senior adjuster.',
].join('\n\n');

describe('splitIntoBlocks', () => {
  it('makes one block per paragraph', () => {
    expect(splitIntoBlocks(STRUCTURED)).toHaveLength(6);
  });

  it('marks headings and field lines as not rewritable', () => {
    const blocks = splitIntoBlocks(STRUCTURED);
    const byPrefix = (p: string) => blocks.find((b) => b.text.trim().startsWith(p))!;

    expect(byPrefix('World Plan:').rewritable).toBe(false);
    expect(byPrefix('Submission date:').rewritable).toBe(false);
    expect(byPrefix('World Setup').rewritable).toBe(false);
    expect(byPrefix('Jurisdiction and line:').rewritable).toBe(false);
  });

  it('marks prose as rewritable', () => {
    const blocks = splitIntoBlocks(STRUCTURED);
    expect(blocks.find((b) => b.text.trim().startsWith('Mobile money'))!.rewritable).toBe(true);
    expect(blocks.find((b) => b.text.trim().startsWith('Setting and specialty'))!.rewritable).toBe(true);
  });

  it('reports offsets that match the block text', () => {
    for (const block of splitIntoBlocks(STRUCTURED)) {
      expect(STRUCTURED.slice(block.start, block.end)).toBe(block.text);
    }
  });

  it('gives a reason for every block, rewritable or not', () => {
    for (const block of splitIntoBlocks(STRUCTURED)) {
      expect(block.reason.length).toBeGreaterThan(0);
    }
  });

  it('handles empty and whitespace input', () => {
    expect(splitIntoBlocks('')).toEqual([]);
    expect(splitIntoBlocks('   \n\n  ')).toEqual([]);
  });

  it('treats a one-line document as a single block', () => {
    expect(splitIntoBlocks(PROSE)).toHaveLength(1);
  });
});

describe('reassemble', () => {
  it('reproduces the original when nothing was rewritten', () => {
    const blocks = splitIntoBlocks(STRUCTURED);
    expect(reassemble(STRUCTURED, blocks, blocks.map(() => null))).toBe(STRUCTURED);
  });

  it('preserves every paragraph break', () => {
    const blocks = splitIntoBlocks(STRUCTURED);
    const out = reassemble(
      STRUCTURED,
      blocks,
      blocks.map((b) => (b.rewritable ? 'REWRITTEN.' : null)),
    );
    expect(countParagraphs(out)).toBe(countParagraphs(STRUCTURED));
  });

  it('leaves headings untouched while replacing prose', () => {
    const blocks = splitIntoBlocks(STRUCTURED);
    const out = reassemble(
      STRUCTURED,
      blocks,
      blocks.map((b) => (b.rewritable ? 'REWRITTEN.' : null)),
    );
    expect(out).toContain('World Plan: Wren Hollow Apartments Hail Claim');
    expect(out).toContain('Submission date: 09/11/2026');
    expect(out).toContain('REWRITTEN.');
    expect(out).not.toContain('Mobile money did not arrive');
  });

  it('returns the original when there are no blocks', () => {
    expect(reassemble(STRUCTURED, [], [])).toBe(STRUCTURED);
  });
});

describe('countParagraphs', () => {
  it('counts blank-line-separated blocks with text', () => {
    expect(countParagraphs(STRUCTURED)).toBe(6);
    expect(countParagraphs('one')).toBe(1);
    expect(countParagraphs('')).toBe(0);
    expect(countParagraphs('a\n\n\n\nb')).toBe(2);
  });
});
