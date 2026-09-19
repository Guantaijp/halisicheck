import { useQuery } from "@tanstack/react-query"
import { listJobs } from "@/api/jobs.api"
import { useAppStore } from "@/store/useAppStore"

/** Job history. Requires auth — anonymous jobs are not listable by design. */
export function useJobs(limit = 50) {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ["jobs", limit],
    queryFn: () => listJobs(limit),
    enabled: isAuthenticated,
    // A queued job may finish while this page is open.
    refetchInterval: 10_000,
  })
}
