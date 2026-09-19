import { describe, expect, it } from 'vitest';
import { extractJson, flattenContent } from './json-extract.util.js';

describe('extractJson', () => {
  it('parses a clean JSON object', () => {
    expect(extractJson('{"score":72}')).toEqual({ score: 72 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(extractJson('\n  {"score":72}\n ')).toEqual({ score: 72 });
  });

  it('unwraps a ```json fence', () => {
    expect(extractJson('```json\n{"score":72}\n```')).toEqual({ score: 72 });
  });

  it('unwraps a bare fence', () => {
    expect(extractJson('```\n{"score":72}\n```')).toEqual({ score: 72 });
  });

  it('recovers an object padded with prose', () => {
    const raw = 'Here is my assessment:\n{"score":72,"confidence":0.8}\nHope that helps.';
    expect(extractJson(raw)).toEqual({ score: 72, confidence: 0.8 });
  });

  it('handles nested objects when falling back to brace matching', () => {
    const raw = 'Result: {"a":{"b":[1,2]},"c":3} done';
    expect(extractJson(raw)).toEqual({ a: { b: [1, 2] }, c: 3 });
  });

  it('parses arrays', () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns null for a bare scalar, which is never a valid response', () => {
    expect(extractJson('"just a string"')).toBeNull();
    expect(extractJson('42')).toBeNull();
    expect(extractJson('null')).toBeNull();
  });

  it('returns null rather than guessing at unparseable output', () => {
    expect(extractJson('I am unable to assess this image.')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('   ')).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });

  it('does not mistake prose braces for JSON', () => {
    expect(extractJson('the set {a, b} is unordered')).toBeNull();
  });
});

describe('flattenContent', () => {
  it('passes a plain string through', () => {
    expect(flattenContent('hello')).toBe('hello');
  });

  it('joins text chunks', () => {
    expect(
      flattenContent([
        { type: 'text', text: 'part one ' },
        { type: 'text', text: 'part two' },
      ]),
    ).toBe('part one part two');
  });

  it('ignores non-text chunks without dropping the rest', () => {
    expect(
      flattenContent([
        { type: 'text', text: 'kept' },
        { type: 'image_url', imageUrl: { url: 'data:…' } },
      ]),
    ).toBe('kept');
  });

  it('returns null for null, undefined and empty content', () => {
    expect(flattenContent(null)).toBeNull();
    expect(flattenContent(undefined)).toBeNull();
    expect(flattenContent([])).toBeNull();
  });
});
