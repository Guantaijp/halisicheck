import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FlagIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import type { RiskBand } from "@/types/detection.types"
import { BAND_META } from "@/utils/constants"
import { bandForScore } from "@/utils/formatScore"

const BAND_ICON: Record<RiskBand, LucideIcon> = {
  low: CheckCircle2Icon,
  medium: AlertTriangleIcon,
  high: FlagIcon,
}

interface RiskBadgeProps {
  /** Pass a score, or a band directly. */
  score?: number
  band?: RiskBand
  size?: "sm" | "default"
  className?: string
}

/**
 * Band indicator. Always icon + colour + text together — the palette's amber
 * step sits below 3:1 on the light surface, so hue must never carry the
 * meaning on its own.
 */
export function RiskBadge({ score, band, size = "default", className }: RiskBadgeProps) {
  const resolved = band ?? bandForScore(score ?? 0)
  const meta = BAND_META[resolved]
  const Icon = BAND_ICON[resolved]

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
        size === "sm" ? "text-[11px]" : "text-xs",
        meta.ink,
        className
      )}
      style={{
        borderColor: `color-mix(in oklch, ${meta.cssVar} 45%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${meta.cssVar} 12%, transparent)`,
      }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden />
      {meta.label}
    </span>
  )
}

/** The bare colour chip, for legends and table cells where text sits alongside. */
export function RiskDot({ band, className }: { band: RiskBand; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: BAND_META[band].cssVar }}
    />
  )
}
