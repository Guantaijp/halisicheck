import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import {
  createDocumentJob,
  createImageJob,
  createTextJob,
  createVideoJob,
} from "@/api/jobs.api"
import type { JobStatusResponse } from "@/types/api.types"
import type { UploadMode } from "@/components/upload/UploadTabs"

export interface UploadInput {
  mode: UploadMode
  text: string
  file: File | null
}

/**
 * Creates a job from whichever tab is active.
 *
 * Pasted text returns a finished job from this one call; everything else
 * returns a pending job the caller then polls.
 */
export function useUpload() {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState(0)

  const mutation = useMutation<JobStatusResponse, Error, UploadInput>({
    mutationFn: async ({ mode, text, file }) => {
      setProgress(0)

      if (mode === "text") return createTextJob(text)
      if (!file) throw new Error("Choose a file first.")

      const send =
        mode === "image"
          ? createImageJob
          : mode === "video"
            ? createVideoJob
            : createDocumentJob

      return send(file, setProgress)
    },
    onSuccess: () => {
      // The new job belongs in history immediately.
      void queryClient.invalidateQueries({ queryKey: ["jobs"] })
    },
  })

  return { ...mutation, uploadProgress: progress }
}
