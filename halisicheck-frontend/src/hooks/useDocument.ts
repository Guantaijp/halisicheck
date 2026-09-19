import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getDocument, resetDocument, saveDocument } from "@/api/jobs.api"
import type { DocumentResponse } from "@/types/api.types"

const key = (jobId: string) => ["document", jobId]

/**
 * The finished document.
 *
 * Refetched whenever an accept/reject changes, because the derived text is a
 * function of which rewrites are accepted.
 */
export function useDocument(jobId: string, enabled = true) {
  return useQuery<DocumentResponse>({
    queryKey: key(jobId),
    queryFn: () => getDocument(jobId),
    enabled: Boolean(jobId) && enabled,
  })
}

export function useSaveDocument(jobId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (text: string) => saveDocument(jobId, text),
    onSuccess: (_data, text) => {
      // Reflect the save immediately so the "unsaved" state clears without a
      // round-trip, then reconcile with the server.
      queryClient.setQueryData<DocumentResponse>(key(jobId), (previous) =>
        previous ? { ...previous, text, editedText: text, isEdited: true } : previous,
      )
      void queryClient.invalidateQueries({ queryKey: key(jobId) })
    },
  })
}

export function useResetDocument(jobId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => resetDocument(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key(jobId) })
    },
  })
}
