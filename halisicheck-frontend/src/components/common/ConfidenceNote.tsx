import { InfoIcon } from "lucide-react"
import { cn } from "cn"
import { DETECTION_CAVEAT } from "@/utils/constants"

/**
 * The standing caveat. Rendered next to every score in the product — the
 * design brief is explicit that a detection result is never a verdict.
 */
export function ConfidenceNote({
  className,
  text = DETECTION_CAVEAT,
}: {
  className?: string
  text?: string
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-xs leading-relaxed text-muted-foreground",
        className
      )}
    >
      <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  )
}
