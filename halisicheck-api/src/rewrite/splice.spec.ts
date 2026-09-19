import { describe, expect, it } from 'vitest';
import { applySplices, preserveWhitespaceEnvelope } from './splice.util.js';

describe('applySplices', () => {
  const source = 'The quick brown fox jumps over the lazy dog.';

  it('returns the source unchanged when there is nothing to apply', () => {
    expect(applySplices(source, [])).toBe(source);
  });

  it('replaces a single range', () => {
    expect(applySplices(source, [{ start: 4, end: 9, text: 'slow' }])).toBe(
      'The slow brown fox jumps over the lazy dog.',
    );
  });

  it('applies multiple ranges without offset drift when lengths change', () => {
    // Both replacements change length; a naive forward loop corrupts the second.
    const result = applySplices(source, [
      { start: 4, end: 9, text: 'extraordinarily sluggish' },
      { start: 35, end: 39, text: 'energetic' },
    ]);
    expect(result).toBe(
      'The extraordinarily sluggish brown fox jumps over the energetic dog.',
    );
  });

  it('is order-independent', () => {
    const a = applySplices(source, [
      { start: 4, end: 9, text: 'slow' },
      { start: 35, end: 39, text: 'keen' },
    ]);
    const b = applySplices(source, [
      { start: 35, end: 39, text: 'keen' },
      { start: 4, end: 9, text: 'slow' },
    ]);
    expect(a).toBe(b);
  });

  it('handles adjacent ranges that share a boundary', () => {
    expect(
      applySplices('abcdef', [
        { start: 0, end: 3, text: 'X' },
        { start: 3, end: 6, text: 'Y' },
      ]),
    ).toBe('XY');
  });

  it('supports insertion and deletion', () => {
    expect(applySplices('abcdef', [{ start: 3, end: 3, text: '-' }])).toBe('abc-def');
    expect(applySplices('abcdef', [{ start: 1, end: 4, text: '' }])).toBe('aef');
  });

  it('rejects overlapping ranges rather than corrupting the document', () => {
    expect(() =>
      applySplices(source, [
        { start: 4, end: 12, text: 'X' },
        { start: 9, end: 15, text: 'Y' },
      ]),
    ).toThrow(/Overlapping/);
  });

  it('rejects two replacements for identical offsets', () => {
    // Regression: accepting both the British and Kenyan rewrite of one span
    // produced exactly this, and took the whole export down with a 500.
    // The guard is correct; callers must not reach it. See RewriteService.decide.
    expect(() =>
      applySplices(source, [
        { start: 0, end: 15, text: 'British version.' },
        { start: 0, end: 15, text: 'Kenyan version.' },
      ]),
    ).toThrow(/Overlapping/);
  });

  it('rejects out-of-bounds and inverted ranges', () => {
    expect(() => applySplices('abc', [{ start: 0, end: 99, text: 'X' }])).toThrow(RangeError);
    expect(() => applySplices('abc', [{ start: -1, end: 2, text: 'X' }])).toThrow(RangeError);
    expect(() => applySplices('abc', [{ start: 2, end: 1, text: 'X' }])).toThrow(RangeError);
  });

  it('does not mutate the input array', () => {
    const splices = [
      { start: 35, end: 39, text: 'keen' },
      { start: 4, end: 9, text: 'slow' },
    ];
    const snapshot = JSON.parse(JSON.stringify(splices));
    applySplices(source, splices);
    expect(splices).toEqual(snapshot);
  });
});

describe('preserveWhitespaceEnvelope', () => {
  it('restores a trailing space so sentences do not weld together', () => {
    expect(preserveWhitespaceEnvelope('Original sentence. ', 'New sentence.')).toBe(
      'New sentence. ',
    );
  });

  it('restores leading whitespace', () => {
    expect(preserveWhitespaceEnvelope('  Original.', 'New.')).toBe('  New.');
  });

  it('restores both ends, including newlines', () => {
    expect(preserveWhitespaceEnvelope('\n\nOriginal.\n\n', 'New.')).toBe('\n\nNew.\n\n');
  });

  it('trims whitespace the model added of its own accord', () => {
    expect(preserveWhitespaceEnvelope('Original. ', '  New.  ')).toBe('New. ');
  });

  it('is a no-op when the original had no surrounding whitespace', () => {
    expect(preserveWhitespaceEnvelope('Original.', 'New.')).toBe('New.');
  });

  it('leaves an all-whitespace original alone', () => {
    expect(preserveWhitespaceEnvelope('   ', 'New.')).toBe('New.');
  });

  it('keeps a spliced document readable end to end', () => {
    const source = 'First sentence. Second sentence. Third sentence.';
    const spliced = applySplices(source, [
      {
        start: 0,
        end: 16,
        text: preserveWhitespaceEnvelope(source.slice(0, 16), 'Replaced one.'),
      },
      {
        start: 16,
        end: 33,
        text: preserveWhitespaceEnvelope(source.slice(16, 33), 'Replaced two.'),
      },
    ]);
    expect(spliced).toBe('Replaced one. Replaced two. Third sentence.');
  });
});
