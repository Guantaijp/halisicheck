import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { DetectionSignal } from "@/types/detection.types"

/**
 * Magnitude comparison across named signals — one series, so a single
 * sequential hue rather than a colour per row (a value-ramp on nominal
 * categories would double-encode the bar length as hue). Values are direct
 * labelled; the tooltip only adds the explanation.
 */
export function SignalBreakdown({ signals }: { signals: DetectionSignal[] }) {
  return (
    <ul className="space-y-3.5">
      {signals.map((signal) => (
        <li key={signal.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="text-left font-medium underline decoration-dotted decoration-from-font underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                }
              >
                {signal.label}
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {signal.description}
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground tabular-nums">
              {signal.value}
              <span className="ml-1.5 text-[11px] opacity-70">
                {/* Weight 0 means the signal is not averaged in — it can only
                    add to the score, never dilute it. Saying "×0.00" would
                    read as "ignored", which is the opposite. */}
                {signal.weight === 0 ? "uplift only" : `×${signal.weight.toFixed(2)}`}
              </span>
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${signal.value}%`,
                backgroundColor: "var(--seq-400)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
