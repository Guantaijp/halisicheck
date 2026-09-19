import { cn } from "cn"
import { RiskDot } from "@/components/common/RiskBadge"
import type { FrameScore } from "@/types/media.types"
import { bandForScore, formatScore, formatTimestamp } from "@/utils/formatScore"

/**
 * Placeholder frame tile. With no backend there is no real still to show, so
 * the tile is explicitly a stand-in rather than a fake image.
 */
export function FrameThumbnail({
  frame,
  isActive,
  onSelect,
}: {
  frame: FrameScore
  isActive: boolean
  onSelect: (frame: FrameScore) => void
}) {
  const band = bandForScore(frame.score)

  return (
    <button
      type="button"
      onClick={() => onSelect(frame)}
      className={cn(
        "group w-28 shrink-0 overflow-hidden rounded-lg border text-left transition-colors outline-none hover:border-muted-foreground/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isActive && "border-ring ring-[3px] ring-ring/40"
      )}
    >
      <div
        className="grid h-16 place-items-center text-[10px] tracking-wide text-muted-foreground uppercase"
        style={{
          backgroundColor: `color-mix(in oklch, ${
            frame.flagged ? "var(--risk-high)" : "var(--seq-250)"
          } 16%, var(--muted))`,
        }}
      >
        frame
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <RiskDot band={band} />
        <span className="text-[11px] font-medium tabular-nums">
          {formatScore(frame.score)}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {formatTimestamp(frame.timestamp)}
        </span>
      </div>
    </button>
  )
}
