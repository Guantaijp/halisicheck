import {
  CheckIcon,
  ClockIcon,
  Loader2Icon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { JobStatus } from "@/types/job.types"

const STATUS: Record<
  JobStatus,
  { label: string; icon: LucideIcon; variant: "secondary" | "outline" | "destructive"; spin?: boolean }
> = {
  pending: { label: "Queued", icon: ClockIcon, variant: "outline" },
  processing: { label: "Analysing", icon: Loader2Icon, variant: "secondary", spin: true },
  done: { label: "Done", icon: CheckIcon, variant: "outline" },
  failed: { label: "Failed", icon: TriangleAlertIcon, variant: "destructive" },
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, icon: Icon, variant, spin } = STATUS[status]
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={spin ? "animate-spin" : undefined} aria-hidden />
      {label}
    </Badge>
  )
}
