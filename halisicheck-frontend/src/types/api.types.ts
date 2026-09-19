import type { RiskBand } from "./detection.types"
import type { JobStatus, JobType } from "./job.types"

/**
 * Wire types — these mirror what the API actually returns.
 *
 * Kept separate from the view types in detection.types.ts so a change to the
 * API surfaces here as a type error rather than quietly reshaping components.
 */

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

export interface AuthResponse {
  accessToken: string
  expiresIn: string
  user: AuthUser
}

export interface JobSummary {
  score: number | null
  confidenceMargin: number | null
  band: RiskBand | null
  flaggedSpans: number
  wordCount: number | null
}

export interface JobStatusResponse {
  id: string
  type: JobType
  status: JobStatus
  progress: number
  sourceName: string
  error: string | null
  createdAt: string
  finishedAt: string | null
  resultUrl: string | null
  /** Present only on the list endpoint. */
  summary?: JobSummary
}

export interface ApiSignal {
  id: string
  label: string
  description: string
  value: number
  weight: number
  effectiveWeight: number
  reliable: boolean
}

export interface ApiSpan {
  id: string
  startOffset: number
  endOffset: number
  score: number
  band: RiskBand
  reasons: string[]
  text: string
  paragraphIndex: number
}

export type RewriteScope = "spans" | "passage"

export interface ApiRewrite {
  id: string
  spanId: string | null
  /** 'passage' replaces the whole document; 'span' replaces one sentence. */
  scope: "span" | "passage"
  dialect: "british" | "kenyan"
  originalText: string
  rewrittenText: string
  rationale: string | null
  /** null means still awaiting review. */
  accepted: boolean | null
}

export interface TextResultResponse {
  jobId: string
  type: JobType
  sourceName: string
  analysedAt: string | null
  wordCount: number
  extractionMethod: string
  extractedText: string
  score: number
  confidenceMargin: number
  band: RiskBand
  modelUsed: string
  signals: ApiSignal[]
  spans: ApiSpan[]
  rewrites: ApiRewrite[]
  rewriteAvailable: true
  caveat: string
}

export interface ApiMediaSignal {
  id: string
  label: string
  detail: string
  triggered: boolean
  band: RiskBand | "none"
}

export interface ApiFrame {
  timestamp: number
  score: number
  flagged: boolean
}

export interface MediaResultResponse {
  jobId: string
  type: "image" | "video"
  sourceName: string
  analysedAt: string | null
  score: number | null
  confidenceMargin: number | null
  modelUsed: string | null
  dimensions: { width: number; height: number } | null
  durationSeconds: number | null
  frames: ApiFrame[]
  signals: ApiMediaSignal[]
  audioNote: string | null
  rewriteAvailable: false
  caveat: string
}

export type ResultResponse = TextResultResponse | MediaResultResponse

export function isMediaResult(
  result: ResultResponse,
): result is MediaResultResponse {
  return result.rewriteAvailable === false
}

/** The finished document, in every version a reader might want. */
export interface DocumentResponse {
  jobId: string
  /** Whichever version should be treated as final. */
  text: string
  /** Original with accepted rewrites spliced in. */
  derivedText: string
  /** The extracted text, before any rewrite. */
  originalText: string
  /** The reviewer's own version, if they saved one. */
  editedText: string | null
  isEdited: boolean
  appliedCount: number
  editedAt: string | null
}

export type ExportFormat = "txt" | "docx" | "pdf"
