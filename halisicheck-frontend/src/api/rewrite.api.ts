import { api } from "./client"
import type { ApiRewrite, RewriteScope } from "@/types/api.types"
import type { Dialect } from "@/types/detection.types"

/**
 * Generates suggestions. Nothing is applied to the document — each suggestion
 * comes back awaiting a human decision.
 *
 * `scope: "spans"` rewrites each flagged sentence on its own. `scope:
 * "passage"` rewrites the whole document in one pass, which is the only mode
 * that can change sentence-length variation.
 */
export async function generateRewrites(
  jobId: string,
  dialect: Dialect,
  scope: RewriteScope = "spans",
  spanIds?: string[],
): Promise<ApiRewrite[]> {
  const { data } = await api.post<ApiRewrite[]>(`/jobs/${jobId}/rewrites`, {
    dialect,
    scope,
    ...(scope === "spans" && spanIds && spanIds.length > 0 ? { spanIds } : {}),
  })
  return data
}

export async function decideRewrite(
  rewriteId: string,
  accepted: boolean | null,
): Promise<{ id: string; accepted: boolean | null }> {
  const { data } = await api.post<{ id: string; accepted: boolean | null }>(
    `/jobs/rewrites/${rewriteId}/decision`,
    { accepted },
  )
  return data
}
