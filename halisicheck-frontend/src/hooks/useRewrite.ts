import { useMutation, useQueryClient } from "@tanstack/react-query"
import { decideRewrite, generateRewrites } from "@/api/rewrite.api"
import type {
  ApiRewrite,
  RewriteScope,
  TextResultResponse,
} from "@/types/api.types"
import type { Dialect } from "@/types/detection.types"

/** Generates suggestions, then folds them into the cached report. */
export function useGenerateRewrites(jobId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    ApiRewrite[],
    Error,
    { dialect: Dialect; scope: RewriteScope; spanIds?: string[] }
  >({
    mutationFn: ({ dialect, scope, spanIds }) =>
      generateRewrites(jobId, dialect, scope, spanIds),
    onSuccess: (rewrites, { dialect, scope }) => {
      queryClient.setQueryData<TextResultResponse>(["result", jobId], (previous) => {
        if (!previous) return previous
        // Replace same-dialect, same-scope suggestions rather than appending.
        // The server does the same, so the cache must not disagree with it.
        const kept = previous.rewrites.filter(
          (r) =>
            r.dialect !== dialect ||
            (scope === "passage" ? r.scope !== "passage" : r.scope !== "span"),
        )
        return { ...previous, rewrites: [...kept, ...rewrites] }
      })
      void queryClient.invalidateQueries({ queryKey: ["document", jobId] })
    },
  })
}

/**
 * Records an accept/reject. Updates the cache immediately and rolls back if
 * the server rejects it — the decision must never appear to stick when it did
 * not, since the export depends on it.
 */
export function useDecideRewrite(jobId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    { id: string; accepted: boolean | null },
    Error,
    { rewriteId: string; accepted: boolean | null },
    { previous?: TextResultResponse }
  >({
    mutationFn: ({ rewriteId, accepted }) => decideRewrite(rewriteId, accepted),

    onMutate: async ({ rewriteId, accepted }) => {
      await queryClient.cancelQueries({ queryKey: ["result", jobId] })
      const previous = queryClient.getQueryData<TextResultResponse>(["result", jobId])

      queryClient.setQueryData<TextResultResponse>(["result", jobId], (current) =>
        current
          ? {
              ...current,
              rewrites: current.rewrites.map((r) =>
                r.id === rewriteId ? { ...r, accepted } : r,
              ),
            }
          : current,
      )

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["result", jobId], context.previous)
      }
    },

    onSettled: () => {
      // The final document is derived from which rewrites are accepted, so it
      // has to be rebuilt whenever a decision lands.
      void queryClient.invalidateQueries({ queryKey: ["document", jobId] })
      // Accepting one dialect's rewrite returns the other dialect's rewrite
      // for the same span to review, so the optimistic update above is not
      // the whole story — refetch to pick up any displaced sibling.
      void queryClient.invalidateQueries({ queryKey: ["result", jobId] })
    },
  })
}
