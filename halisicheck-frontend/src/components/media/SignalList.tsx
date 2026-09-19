import { CheckIcon, MinusIcon } from "lucide-react"
import { RiskDot } from "@/components/common/RiskBadge"
import type { MediaSignal } from "@/types/media.types"

/** Which signal fired, and what it actually tells you. */
export function SignalList({ signals }: { signals: MediaSignal[] }) {
  return (
    <ul className="divide-y">
      {signals.map((signal) => (
        <li key={signal.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <span className="mt-0.5 shrink-0">
            {signal.triggered ? (
              <span className="grid size-5 place-items-center rounded-full bg-muted">
                <CheckIcon className="size-3" aria-hidden />
              </span>
            ) : (
              <span className="grid size-5 place-items-center rounded-full bg-muted text-muted-foreground">
                <MinusIcon className="size-3" aria-hidden />
              </span>
            )}
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{signal.label}</p>
              {signal.band !== "none" ? <RiskDot band={signal.band} /> : null}
              <span className="text-[11px] text-muted-foreground">
                {signal.triggered ? "fired" : "no signal"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {signal.detail}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
