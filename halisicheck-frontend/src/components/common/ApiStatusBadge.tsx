import { useQuery } from "@tanstack/react-query"
import { getHealth } from "@/api/health.api"
import { cn } from "cn"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * Live API status in the navbar.
 *
 * Shows three states, not two: connected, connected-but-degraded (the API is
 * up without a Mistral key, so rewrites and classification are unavailable),
 * and unreachable. Conflating the middle one with an outage would send people
 * looking for the wrong problem.
 */
export function ApiStatusBadge() {
  const { data, isError } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
    retry: false,
  })

  const mistralReady = data?.checks?.mistral?.ok ?? false
  const state = isError || !data ? "down" : mistralReady ? "ready" : "degraded"

  const label =
    state === "down"
      ? "API unreachable"
      : state === "degraded"
        ? "Detection only"
        : "API connected"

  const detail =
    state === "down"
      ? "Could not reach the API. Start it with `pnpm start:dev` in halisicheck-api."
      : state === "degraded"
        ? (data?.checks?.mistral?.detail ??
          "The model is not configured, so rewrites and media classification are unavailable.")
        : `Connected. ${data?.checks?.mistral?.detail ?? ""}`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="hidden cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex" />
        }
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-1.5 rounded-full",
            state === "ready" && "bg-risk-low",
            state === "degraded" && "bg-risk-medium",
            state === "down" && "bg-risk-high",
          )}
        />
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{detail}</TooltipContent>
    </Tooltip>
  )
}
