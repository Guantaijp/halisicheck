import { cn } from "cn"
import { RiskBadge } from "@/components/common/RiskBadge"
import { BAND_THRESHOLDS } from "@/utils/constants"
import { formatRange, formatScore, metaForScore } from "@/utils/formatScore"

interface ScoreGaugeProps {
  score: number
  margin: number
  label?: string
  className?: string
}

/**
 * A single ratio against a limit — so a meter, not a radial gauge or a
 * one-bar chart. The *range* is the primary mark and the point estimate is a
 * tick inside it, because a solid bar to a single number reads as certainty
 * the detector does not have.
 */
export function ScoreGauge({
  score,
  margin,
  label = "AI-likelihood",
  className,
}: ScoreGaugeProps) {
  const meta = metaForScore(score)
  const low = Math.max(0, score - margin)
  const high = Math.min(100, score + margin)

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <RiskBadge score={score} />
      </div>

      <div className="flex items-baseline gap-2.5">
        {/* Hero figure: proportional figures, same sans as everything else. */}
        <span className="text-5xl leading-none font-semibold tracking-tight">
          {formatScore(score)}
        </span>
        <span className="text-sm text-muted-foreground">
          likely range {formatRange(score, margin)}
        </span>
      </div>

      <div className="space-y-1.5">
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full"
          style={{
            backgroundColor: `color-mix(in oklch, ${meta.cssVar} 14%, transparent)`,
          }}
          role="meter"
          aria-valuenow={Math.round(score)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${formatScore(score)}, likely range ${formatRange(score, margin)}`}
        >
          {/* Confidence interval — the honest extent of what is known. */}
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${low}%`,
              width: `${Math.max(high - low, 1)}%`,
              backgroundColor: `color-mix(in oklch, ${meta.cssVar} 55%, transparent)`,
            }}
          />
          {/* Band thresholds, drawn where they actually fall on the scale. */}
          {[BAND_THRESHOLDS.medium, BAND_THRESHOLDS.high].map((t) => (
            <div
              key={t}
              className="absolute inset-y-0 w-px bg-background/70"
              style={{ left: `${t}%` }}
            />
          ))}
          {/* Point estimate. */}
          <div
            className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full"
            style={{ left: `${score}%`, backgroundColor: meta.cssVar }}
          />
        </div>

        {/* Threshold ticks sit at their real positions, so the row cannot be
            misread as four evenly spaced marks. */}
        <div className="relative h-4 text-[11px] text-muted-foreground tabular-nums">
          <span className="absolute left-0">0</span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${BAND_THRESHOLDS.medium}%` }}
          >
            {BAND_THRESHOLDS.medium}
          </span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${BAND_THRESHOLDS.high}%` }}
          >
            {BAND_THRESHOLDS.high}
          </span>
          <span className="absolute right-0">100</span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{meta.meaning}</p>
    </div>
  )
}
