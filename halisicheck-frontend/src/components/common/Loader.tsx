import { Loader2Icon } from "lucide-react"
import { cn } from "cn"

export function Loader({
  label = "Loading",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground",
        className
      )}
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      {label}…
    </div>
  )
}
