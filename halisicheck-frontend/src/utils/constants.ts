import type { Dialect, RiskBand } from "@/types/detection.types"
import type { JobType } from "@/types/job.types"

/**
 * Band thresholds. Deliberately coarse — the product line is "flagged for
 * review", not a verdict, so finer granularity would imply precision the
 * detector does not have.
 */
export const BAND_THRESHOLDS = { medium: 40, high: 70 } as const

export interface BandMeta {
  band: RiskBand
  /** Short label used beside the swatch. Never let colour speak alone. */
  label: string
  /** What the band actually licenses the reader to conclude. */
  meaning: string
  /** Tailwind class for the mark/fill colour. */
  fill: string
  /** Tailwind class for contrast-safe text. */
  ink: string
  /** CSS var, for inline styles and chart marks. */
  cssVar: string
}

export const BAND_META: Record<RiskBand, BandMeta> = {
  low: {
    band: "low",
    label: "Low likelihood",
    meaning: "Reads as human-written. No review needed.",
    fill: "bg-risk-low",
    ink: "text-risk-low-ink",
    cssVar: "var(--risk-low)",
  },
  medium: {
    band: "medium",
    label: "Worth a look",
    meaning: "Mixed signals. Skim it before you rely on it.",
    fill: "bg-risk-medium",
    ink: "text-risk-medium-ink",
    cssVar: "var(--risk-medium)",
  },
  high: {
    band: "high",
    label: "Flagged for review",
    meaning: "Several signals agree. Needs a human decision.",
    fill: "bg-risk-high",
    ink: "text-risk-high-ink",
    cssVar: "var(--risk-high)",
  },
}

export const DIALECTS: { value: Dialect; label: string; hint: string }[] = [
  {
    value: "british",
    label: "British English",
    hint: "-ise endings, Oxford register, British idiom",
  },
  {
    value: "kenyan",
    label: "Kenyan English",
    hint: "East African register and vocabulary, British spelling base",
  },
]

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  text: "Pasted text",
  docx: "Word document",
  pdf: "PDF",
  image: "Image",
  video: "Video",
}


/** Standing caveat. Shown wherever a score is shown. */
export const DETECTION_CAVEAT =
  "AI detection is probabilistic. Treat every score as a prompt to look closer, never as proof."
