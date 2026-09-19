/**
 * Detection is never reported as a verdict — only as a likelihood with a
 * confidence range. `RiskBand` names the band a score falls in; it always
 * travels with an icon and a text label in the UI, never colour alone.
 */
export type RiskBand = "low" | "medium" | "high"

export type Dialect = "british" | "kenyan"

/** One scored run of text inside a paragraph. `score === null` = not flagged. */
export interface TextSegment {
  id: string
  text: string
  score: number | null
  /** Character offsets into the full extracted text, as stored by the API. */
  startOffset: number
  endOffset: number
  /** Which signals contributed to this span being flagged. */
  reasons?: string[]
}

export interface Paragraph {
  id: string
  segments: TextSegment[]
}

/** A named detector signal and how strongly it fired. */
export interface DetectionSignal {
  id: string
  label: string
  description: string
  /** 0–100. Higher = more AI-like on this signal. */
  value: number
  weight: number
}

export interface TextDetectionReport {
  jobId: string
  sourceName: string
  modelUsed: string
  analysedAt: string
  wordCount: number
  /** Overall AI-likelihood 0–100 — a likelihood, never a verdict. */
  score: number
  /** Half-width of the confidence interval, in points. */
  confidenceMargin: number
  paragraphs: Paragraph[]
  signals: DetectionSignal[]
}

export type ChunkDecision = "pending" | "accepted" | "rejected"
