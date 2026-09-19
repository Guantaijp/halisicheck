import { describe, expect, it } from "vitest"
import { buildParagraphs } from "./buildParagraphs"
import type { ApiSpan } from "@/types/api.types"

function span(start: number, end: number, over: Partial<ApiSpan> = {}): ApiSpan {
  return {
    id: `s-${start}-${end}`,
    startOffset: start,
    endOffset: end,
    score: 80,
    band: "high",
    reasons: ["Stock phrase"],
    text: "",
    paragraphIndex: 0,
    ...over,
  }
}

/** Concatenating every segment must reproduce the paragraph exactly. */
function rejoin(text: string, spans: ApiSpan[]): string {
  return buildParagraphs(text, spans)
    .flatMap((p) => p.segments.map((s) => s.text))
    .join("")
}

describe("buildParagraphs", () => {
  const TEXT = "First sentence. Second sentence.\n\nThird sentence. Fourth one."

  it("returns one paragraph per blank-line-separated block", () => {
    expect(buildParagraphs(TEXT, [])).toHaveLength(2)
  })

  it("is lossless — segments rejoin to the original paragraphs", () => {
    const spans = [span(16, 32), span(50, 61)]
    expect(rejoin(TEXT, spans)).toBe(TEXT.replace(/\n\n/g, ""))
  })

  it("slices segments at exactly the offsets the API gave", () => {
    const spans = [span(0, 15)]
    const [first] = buildParagraphs(TEXT, spans)
    const flagged = first.segments.find((s) => s.score !== null)
    expect(flagged?.text).toBe(TEXT.slice(0, 15))
    expect(flagged?.startOffset).toBe(0)
    expect(flagged?.endOffset).toBe(15)
  })

  it("carries the server span id so rewrites can address it", () => {
    const [first] = buildParagraphs(TEXT, [span(0, 15, { id: "server-uuid" })])
    expect(first.segments.find((s) => s.score !== null)?.id).toBe("server-uuid")
  })

  it("keeps unflagged text as segments with a null score", () => {
    const [first] = buildParagraphs(TEXT, [span(0, 15)])
    expect(first.segments.filter((s) => s.score === null).length).toBeGreaterThan(0)
  })

  it("handles a document with no spans at all", () => {
    const paragraphs = buildParagraphs(TEXT, [])
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].segments.every((s) => s.score === null)).toBe(true)
    expect(rejoin(TEXT, [])).toBe(TEXT.replace(/\n\n/g, ""))
  })

  it("handles a paragraph that is entirely one span", () => {
    const text = "All of this is flagged."
    const [p] = buildParagraphs(text, [span(0, text.length)])
    expect(p.segments).toHaveLength(1)
    expect(p.segments[0].score).toBe(80)
  })

  it("assigns spans to the right paragraph", () => {
    const paragraphs = buildParagraphs(TEXT, [span(33, 49)])
    expect(paragraphs[0].segments.every((s) => s.score === null)).toBe(true)
    expect(paragraphs[1].segments.some((s) => s.score !== null)).toBe(true)
  })

  it("ignores spans that fall outside the text", () => {
    expect(() => buildParagraphs(TEXT, [span(9000, 9100)])).not.toThrow()
    expect(rejoin(TEXT, [span(9000, 9100)])).toBe(TEXT.replace(/\n\n/g, ""))
  })

  it("does not duplicate text when spans overlap", () => {
    // The API should never emit these, but a duplicated sentence in the
    // reader would be a silent, confusing corruption.
    const spans = [span(0, 20), span(10, 31)]
    expect(rejoin(TEXT, spans)).toBe(TEXT.replace(/\n\n/g, ""))
  })

  it("tolerates unsorted spans", () => {
    const spans = [span(50, 61), span(0, 15)]
    expect(rejoin(TEXT, spans)).toBe(TEXT.replace(/\n\n/g, ""))
  })

  it("handles empty and whitespace-only documents", () => {
    expect(buildParagraphs("", [])).toEqual([])
    expect(buildParagraphs("   \n\n  ", [])).toEqual([])
  })

  it("collapses runs of more than one blank line", () => {
    expect(buildParagraphs("One.\n\n\n\nTwo.", [])).toHaveLength(2)
  })
})
