import type { RiskBand } from "@/types/detection.types"
import { BAND_META, BAND_THRESHOLDS, type BandMeta } from "./constants"

export function bandForScore(score: number): RiskBand {
  if (score >= BAND_THRESHOLDS.high) return "high"
  if (score >= BAND_THRESHOLDS.medium) return "medium"
  return "low"
}

export function metaForScore(score: number): BandMeta {
  return BAND_META[bandForScore(score)]
}

/** Scores are shown as whole percentages — decimals imply false precision. */
export function formatScore(score: number): string {
  return `${Math.round(score)}%`
}

/**
 * Renders the confidence interval, clamped to 0–100. The range is part of the
 * number, not a footnote: a bare score reads as certainty.
 */
export function formatRange(score: number, margin: number): string {
  const low = Math.max(0, Math.round(score - margin))
  const high = Math.min(100, Math.round(score + margin))
  return `${low}–${high}%`
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `${diffD}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function formatWordCount(n: number): string {
  return `${n.toLocaleString()} word${n === 1 ? "" : "s"}`
}
