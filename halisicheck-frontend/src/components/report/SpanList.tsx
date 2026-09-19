import { cn } from "cn"
import { RiskDot } from "@/components/common/RiskBadge"
import type { TextSegment } from "@/types/detection.types"
import { bandForScore, formatScore } from "@/utils/formatScore"

/**
 * The table-view twin of the highlighted reader: every flagged span reachable
 * as text and number, without relying on the tint to find it.
 */
export function SpanList({
  spans,
  activeSpanId,
  onSpanSelect,
}: {
  spans: TextSegment[]
  activeSpanId: string | null
  onSpanSelect: (id: string | null) => void
}) {
  if (spans.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing flagged in this document.
      </p>
    )
  }

  return (
    <ol className="divide-y">
      {spans.map((span) => {
        const isActive = activeSpanId === span.id
        return (
          <li key={span.id}>
            <button
              type="button"
              onClick={() => {
                onSpanSelect(isActive ? null : span.id)
                document
                  .getElementById(`span-${span.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }}
              className={cn(
                "w-full px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
                isActive && "bg-muted"
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                <RiskDot band={bandForScore(span.score ?? 0)} />
                <span className="text-xs font-medium tabular-nums">
                  {formatScore(span.score ?? 0)}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                  {span.startOffset}–{span.endOffset}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {span.text.trim()}
              </p>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
