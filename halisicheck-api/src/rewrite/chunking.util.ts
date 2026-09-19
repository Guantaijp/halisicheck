import { countWords, splitSentences } from '../detection-text/heuristics/segmentation.util.js';

export interface TextBlock {
  index: number;
  text: string;
  /** Offsets into the source, so blocks reassemble losslessly. */
  start: number;
  end: number;
  wordCount: number;
  /**
   * False for headings, labels and field lines. These are returned verbatim:
   * rewriting "World Plan: Wren Hollow Apartments Hail Claim" into a sentence
   * destroys the document, which is exactly what happened before this flag
   * existed.
   */
  rewritable: boolean;
  reason: string;
}

/**
 * Splits a document into blocks for rewriting, one paragraph at a time.
 *
 * Two failures drove this shape.
 *
 * First, length. Given a whole document, output collapses as input grows —
 * measured on one model: 243 words in came back at 81%, 477 at 43%, 1881 at
 * 6%. Past a few hundred words "rewrite this" is quietly reinterpreted as
 * "summarise this", and a long document returns as a title.
 *
 * Second, structure. Asked to rewrite several paragraphs at once, the model
 * merges them into one block. Rather than instruct it not to and hope, each
 * paragraph is its own block and the separators are restored on reassembly —
 * structure is preserved by construction, not by compliance.
 *
 * A paragraph still holds several sentences, which is the context whole-passage
 * rewriting needs to vary sentence rhythm.
 */

/** Below this a block is treated as a heading or label rather than prose. */
const MIN_PROSE_WORDS = 12;

/** Paragraphs longer than this are still sent whole, but flagged as risky. */
export const MAX_BLOCK_WORDS = 320;

function classify(text: string): { rewritable: boolean; reason: string } {
  const trimmed = text.trim();
  const words = countWords(trimmed);

  if (words === 0) return { rewritable: false, reason: 'empty' };

  if (words < MIN_PROSE_WORDS) {
    return {
      rewritable: false,
      reason: 'too short to be prose — treated as a heading or label',
    };
  }

  // "Submission date: 09/11/2026", "Jurisdiction and line: Texas." — a label
  // followed by a value, with no sentence structure of its own.
  const sentences = splitSentences(trimmed);
  const hasTerminalPunctuation = /[.!?]["')\]]?\s*$/.test(trimmed);

  if (!hasTerminalPunctuation && sentences.length <= 1) {
    return {
      rewritable: false,
      reason: 'no sentence structure — treated as a heading or field',
    };
  }

  // A single short sentence prefixed by a label is a field, not a paragraph.
  if (sentences.length === 1 && words < 25 && /^[A-Z][^.!?]{0,40}:/.test(trimmed)) {
    return { rewritable: false, reason: 'label and value — treated as a field' };
  }

  return { rewritable: true, reason: 'prose' };
}

export function splitIntoBlocks(text: string): TextBlock[] {
  if (text.trim().length === 0) return [];

  const blocks: TextBlock[] = [];
  const pattern = /\n[ \t]*\n+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const push = (start: number, end: number) => {
    const slice = text.slice(start, end);
    if (slice.trim().length === 0) return;
    const { rewritable, reason } = classify(slice);
    blocks.push({
      index: blocks.length,
      text: slice,
      start,
      end,
      wordCount: countWords(slice),
      rewritable,
      reason,
    });
  };

  while ((match = pattern.exec(text)) !== null) {
    push(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  push(cursor, text.length);

  return blocks;
}

/**
 * Rebuilds the document, preserving whatever separated the blocks so blank
 * lines and headings survive exactly as they were.
 */
export function reassemble(
  original: string,
  blocks: TextBlock[],
  rewritten: (string | null)[],
): string {
  if (blocks.length === 0) return original;

  const pieces: string[] = [];
  let cursor = 0;

  blocks.forEach((block, index) => {
    pieces.push(original.slice(cursor, block.start));
    pieces.push(rewritten[index] ?? block.text);
    cursor = block.end;
  });

  pieces.push(original.slice(cursor));
  return pieces.join('');
}

/** Blank-line-separated blocks that actually contain text. */
export function countParagraphs(text: string): number {
  return text.split(/\n[ \t]*\n+/).filter((block) => block.trim().length > 0).length;
}
