export interface Splice {
  start: number;
  end: number;
  text: string;
}

/**
 * Replaces ranges in a string by character offset.
 *
 * Applied back-to-front so each replacement cannot shift the offsets of the
 * ones still pending — the classic way this goes wrong is a forward loop where
 * the second splice lands in the wrong place because the first changed length.
 *
 * Overlapping ranges are a programming error, not a user error: two accepted
 * rewrites covering the same text would silently corrupt the document, so it
 * throws rather than producing plausible-looking nonsense.
 */
export function applySplices(source: string, splices: Splice[]): string {
  if (splices.length === 0) return source;

  const ordered = [...splices].sort((a, b) => a.start - b.start);

  for (const splice of ordered) {
    if (splice.start < 0 || splice.end > source.length || splice.start > splice.end) {
      throw new RangeError(
        `Splice [${splice.start}, ${splice.end}) is out of bounds for a ${source.length}-character document.`,
      );
    }
  }

  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) {
      throw new RangeError(
        `Overlapping splices: [${ordered[i - 1].start}, ${ordered[i - 1].end}) and [${ordered[i].start}, ${ordered[i].end}).`,
      );
    }
  }

  let result = source;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const { start, end, text } = ordered[i];
    result = result.slice(0, start) + text + result.slice(end);
  }

  return result;
}

/**
 * Re-attaches the original slice's surrounding whitespace to a replacement.
 *
 * Spans deliberately carry their trailing whitespace so that slicing a
 * document by span offsets is lossless. A model's rewrite comes back trimmed,
 * so splicing it in raw silently welds sentences together ("...stay.This
 * groundbreaking..."). Restoring the envelope keeps the document readable
 * without the caller having to think about it.
 */
export function preserveWhitespaceEnvelope(
  originalSlice: string,
  replacement: string,
): string {
  const leading = /^\s*/.exec(originalSlice)?.[0] ?? '';
  const trailing = /\s*$/.exec(originalSlice)?.[0] ?? '';

  // An all-whitespace original has no meaningful envelope to restore.
  if (originalSlice.trim().length === 0) return replacement;

  return leading + replacement.trim() + trailing;
}
