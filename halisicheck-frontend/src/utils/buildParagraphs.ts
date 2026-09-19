import type { Paragraph, TextSegment } from "@/types/detection.types"
import type { ApiSpan } from "@/types/api.types"

/**
 * Rebuilds the reader's paragraph/segment structure from the API's flat
 * `extractedText` plus its offset-addressed spans.
 *
 * This is the seam between the API's representation (offsets into one string)
 * and the view's (nested segments). Getting it wrong shifts highlights onto
 * the wrong words, which is why it is a pure function with its own tests
 * rather than logic buried in a component.
 */
export function buildParagraphs(text: string, spans: ApiSpan[]): Paragraph[] {
  if (text.length === 0) return []

  const ordered = [...spans]
    .filter((span) => span.endOffset > span.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset)

  const paragraphs: Paragraph[] = []
  let cursor = 0
  let index = 0

  // Paragraph boundaries: one or more blank lines, matching how the API
  // segments documents.
  const boundary = /\n[ \t]*\n+/g
  const ranges: { start: number; end: number }[] = []
  let match: RegExpExecArray | null

  while ((match = boundary.exec(text)) !== null) {
    if (text.slice(cursor, match.index).trim().length > 0) {
      ranges.push({ start: cursor, end: match.index })
    }
    cursor = match.index + match[0].length
  }
  if (text.slice(cursor).trim().length > 0) {
    ranges.push({ start: cursor, end: text.length })
  }

  for (const range of ranges) {
    const segments = segmentsFor(text, ordered, range.start, range.end, index)
    if (segments.length > 0) {
      paragraphs.push({ id: `p${index}`, segments })
      index++
    }
  }

  return paragraphs
}

function segmentsFor(
  text: string,
  ordered: ApiSpan[],
  start: number,
  end: number,
  paragraphIndex: number,
): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = start
  let plainIndex = 0

  const push = (from: number, to: number, span?: ApiSpan) => {
    if (to <= from) return
    segments.push({
      id: span ? span.id : `p${paragraphIndex}-t${plainIndex++}`,
      text: text.slice(from, to),
      score: span ? span.score : null,
      startOffset: from,
      endOffset: to,
      reasons: span?.reasons,
    })
  }

  for (const span of ordered) {
    // Spans outside this paragraph, and any that a previous span already
    // covered (overlaps should not happen, but must not corrupt the output).
    if (span.endOffset <= cursor) continue
    if (span.startOffset >= end) break

    // Clamp so a span straddling a boundary cannot bleed into a neighbour.
    const from = Math.max(span.startOffset, cursor)
    const to = Math.min(span.endOffset, end)
    if (to <= from) continue

    push(cursor, from)
    push(from, to, span)
    cursor = to
  }

  push(cursor, end)
  return segments
}

/** Flagged spans, highest score first — drives the review list. */
export function flaggedSpansFrom(spans: ApiSpan[]): ApiSpan[] {
  return [...spans].sort((a, b) => b.score - a.score)
}
