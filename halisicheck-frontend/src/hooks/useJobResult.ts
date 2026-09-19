import { useQuery } from "@tanstack/react-query"
import { getResult } from "@/api/jobs.api"
import type { ResultResponse } from "@/types/api.types"

/**
 * Fetches a finished report. Kept separate from the status poll so the report
 * is requested exactly once, when the job is actually done.
 */
export function useJobResult(jobId: string | null, ready: boolean) {
  return useQuery<ResultResponse>({
    queryKey: ["result", jobId],
    queryFn: () => getResult(jobId as string),
    enabled: Boolean(jobId) && ready,
    // The detection half of the report is immutable, but the rewrites
    // attached to it are not, so an explicit invalidation must be able to
    // refetch. Stale-time only stops incidental background refetching.
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
