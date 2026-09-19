/**
 * Sentence and paragraph segmentation with character offsets.
 *
 * Offsets are the contract between the detector and the UI: every span the API
 * returns indexes into `documents.extracted_text`, so segmentation must be
 * lossless — concatenating every sentence's slice must reproduce the input.
 */

export interface Sentence {
  text: string;
  /** Inclusive start offset into the source text. */
  start: number;
  /** Exclusive end offset into the source text. */
  end: number;
  paragraphIndex: number;
  wordCount: number;
}

export interface Paragraph {
  text: string;
  start: number;
  end: number;
  index: number;
}

/** Abbreviations that end in a period but do not end a sentence. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt',
  'e.g', 'i.e', 'etc', 'vs', 'cf', 'al', 'fig', 'no', 'vol',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

export function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const pattern = /\n[ \t]*\n+/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const slice = text.slice(cursor, match.index);
    if (slice.trim().length > 0) {
      paragraphs.push({ text: slice, start: cursor, end: match.index, index: index++ });
    }
    cursor = match.index + match[0].length;
  }

  const tail = text.slice(cursor);
  if (tail.trim().length > 0) {
    paragraphs.push({ text: tail, start: cursor, end: text.length, index: index++ });
  }

  return paragraphs;
}

/**
 * Splits on sentence-final punctuation, guarding against abbreviations,
 * decimals and ellipses. Deliberately conservative: a missed split costs
 * granularity, a wrong split corrupts every downstream offset.
 */
export function splitSentences(text: string): Sentence[] {
  const paragraphs = splitParagraphs(text);
  const sentences: Sentence[] = [];

  for (const paragraph of paragraphs) {
    let sentenceStart = 0;
    const body = paragraph.text;

    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (char !== '.' && char !== '!' && char !== '?') continue;

      // Run of terminators ("?!", "...") is consumed as one boundary.
      let end = i;
      while (end + 1 < body.length && '.!?'.includes(body[end + 1])) end++;

      if (char === '.' && isNonTerminalPeriod(body, i)) {
        i = end;
        continue;
      }

      // Absorb a closing quote or bracket that belongs to this sentence.
      let after = end + 1;
      while (after < body.length && `"'”’)]`.includes(body[after])) after++;

      // A sentence ends only if whitespace or the paragraph end follows.
      if (after < body.length && !/\s/.test(body[after])) {
        i = end;
        continue;
      }

      // Trailing whitespace belongs to the sentence so slices rejoin exactly.
      let boundary = after;
      while (boundary < body.length && /\s/.test(body[boundary])) boundary++;

      pushSentence(sentences, body, paragraph, sentenceStart, boundary);
      sentenceStart = boundary;
      i = boundary - 1;
    }

    if (sentenceStart < body.length) {
      pushSentence(sentences, body, paragraph, sentenceStart, body.length);
    }
  }

  return sentences;
}

function pushSentence(
  out: Sentence[],
  body: string,
  paragraph: Paragraph,
  from: number,
  to: number,
): void {
  const slice = body.slice(from, to);
  if (slice.trim().length === 0) return;
  out.push({
    text: slice,
    start: paragraph.start + from,
    end: paragraph.start + to,
    paragraphIndex: paragraph.index,
    wordCount: countWords(slice),
  });
}

function isNonTerminalPeriod(body: string, index: number): boolean {
  // Decimal point: digit on both sides.
  if (/\d/.test(body[index - 1] ?? '') && /\d/.test(body[index + 1] ?? '')) return true;

  // Single initial, e.g. "J. Smith".
  const before = body.slice(Math.max(0, index - 2), index);
  if (/(^|\s)[A-Z]$/.test(before)) return true;

  // Known abbreviation.
  const wordMatch = body.slice(0, index).match(/([A-Za-z.]+)$/);
  if (wordMatch && ABBREVIATIONS.has(wordMatch[1].toLowerCase())) return true;

  return false;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);
}
