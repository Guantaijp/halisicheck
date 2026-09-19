import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChunkDecision } from "@/types/detection.types"

/**
 * Per-chunk decision. Nothing is applied silently — a rewrite only lands in
 * the final document once it has been accepted here.
 */
export function AcceptRejectControls({
  decision,
  onDecide,
}: {
  decision: ChunkDecision
  onDecide: (decision: ChunkDecision) => void
}) {
  if (decision !== "pending") {
    return (
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          style={{
            color:
              decision === "accepted"
                ? "var(--risk-low-ink)"
                : "var(--muted-foreground)",
          }}
        >
          {decision === "accepted" ? (
            <CheckIcon className="size-3.5" aria-hidden />
          ) : (
            <XIcon className="size-3.5" aria-hidden />
          )}
          {decision === "accepted" ? "Accepted" : "Rejected"}
        </span>
        <Button variant="ghost" size="xs" onClick={() => onDecide("pending")}>
          <RotateCcwIcon aria-hidden />
          Undo
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" onClick={() => onDecide("rejected")}>
        <XIcon aria-hidden />
        Keep original
      </Button>
      <Button size="sm" onClick={() => onDecide("accepted")}>
        <CheckIcon aria-hidden />
        Accept
      </Button>
    </div>
  )
}
