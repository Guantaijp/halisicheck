import { useQuery } from "@tanstack/react-query"
import { getJob } from "@/api/jobs.api"
import type { JobStatusResponse } from "@/types/api.types"

const TERMINAL: JobStatusResponse["status"][] = ["done", "failed"]

/**
 * Polls a job until it reaches a terminal state, then stops.
 *
 * The design document offers polling or WebSockets. Polling is used because
 * jobs are short and a socket would add a connection lifecycle to manage for
 * no benefit at this scale; `jobs.api` is the only place to change if that
 * stops being true.
 */
export function useJobPolling(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId as string),
    enabled: Boolean(jobId) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Stop the timer once there is nothing left to wait for.
      if (status && TERMINAL.includes(status)) return false
      return 1500
    },
    // A finished job never changes, so re-fetching it on focus is pure noise.
    refetchOnWindowFocus: (query) =>
      !TERMINAL.includes(query.state.data?.status ?? "pending"),
  })
}
