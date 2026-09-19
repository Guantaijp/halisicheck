import { useEffect, useState } from "react"
import { getMediaBlob } from "@/api/jobs.api"

interface MediaFileState {
  url: string | null
  isLoading: boolean
  error: unknown
}

/**
 * Loads the analysed file and exposes it as an object URL.
 *
 * Not a react-query hook: an object URL is a resource that must be revoked, and
 * tying its lifetime to the component that renders it is clearer than tying it
 * to a cache entry that may outlive the view.
 */
export function useMediaFile(jobId: string | null, enabled = true): MediaFileState {
  const [state, setState] = useState<MediaFileState>({
    url: null,
    isLoading: Boolean(jobId) && enabled,
    error: null,
  })

  useEffect(() => {
    if (!jobId || !enabled) {
      setState({ url: null, isLoading: false, error: null })
      return
    }

    let objectUrl: string | null = null
    let cancelled = false

    setState({ url: null, isLoading: true, error: null })

    getMediaBlob(jobId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setState({ url: objectUrl, isLoading: false, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ url: null, isLoading: false, error })
      })

    return () => {
      cancelled = true
      // Revoking on unmount is what stops the blob leaking for the session.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [jobId, enabled])

  return state
}
