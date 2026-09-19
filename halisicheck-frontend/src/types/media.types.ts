import type { RiskBand } from "./detection.types"

/**
 * View-side media types. These mirror the shapes the API returns for media
 * jobs; the full response type lives in api.types.ts.
 */

export interface FrameScore {
  /** Seconds into the video. */
  timestamp: number
  score: number
  flagged: boolean
}

export interface MediaSignal {
  id: string
  label: string
  detail: string
  triggered: boolean
  band: RiskBand | "none"
}
