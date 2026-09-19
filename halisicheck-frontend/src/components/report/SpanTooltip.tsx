import { RiskBadge } from "@/components/common/RiskBadge"
import type { TextSegment } from "@/types/detection.types"
import { formatScore } from "@/utils/formatScore"

/** Tooltip body for a flagged span: the score, the band, and what fired. */
export function SpanTooltip({ segment }: { segment: TextSegment }) {
  if (segment.score === null) return null

  return (
    <div className="max-w-xs space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums">
          {formatScore(segment.score)}
        </span>
        <RiskBadge score={segment.score} size="sm" />
      </div>

      {segment.reasons?.length ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {segment.reasons.map((reason) => (
            <li key={reason} className="flex gap-1.5">
              <span aria-hidden>·</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
        Characters {segment.startOffset}–{segment.endOffset}
      </p>
    </div>
  )
}
