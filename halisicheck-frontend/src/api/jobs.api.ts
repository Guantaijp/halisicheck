import { api } from "./client"
import type {
  DocumentResponse,
  ExportFormat,
  JobStatusResponse,
  ResultResponse,
} from "@/types/api.types"

export async function createTextJob(
  text: string,
  sourceName?: string,
): Promise<JobStatusResponse> {
  const { data } = await api.post<JobStatusResponse>("/jobs/text", {
    text,
    ...(sourceName ? { sourceName } : {}),
  })
  return data
}

/** Document, image and video all post multipart to their own endpoint. */
async function upload(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<JobStatusResponse> {
  const form = new FormData()
  form.append("file", file)

  const { data } = await api.post<JobStatusResponse>(path, form, {
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    },
  })
  return data
}

export const createDocumentJob = (file: File, onProgress?: (p: number) => void) =>
  upload("/jobs/document", file, onProgress)

export const createImageJob = (file: File, onProgress?: (p: number) => void) =>
  upload("/jobs/image", file, onProgress)

export const createVideoJob = (file: File, onProgress?: (p: number) => void) =>
  upload("/jobs/video", file, onProgress)

export async function getJob(jobId: string): Promise<JobStatusResponse> {
  const { data } = await api.get<JobStatusResponse>(`/jobs/${jobId}`)
  return data
}

export async function listJobs(limit = 50): Promise<JobStatusResponse[]> {
  const { data } = await api.get<JobStatusResponse[]>("/jobs", { params: { limit } })
  return data
}

export async function getResult(jobId: string): Promise<ResultResponse> {
  const { data } = await api.get<ResultResponse>(`/jobs/${jobId}/result`)
  return data
}

/** The finished document: derived, edited, and original in one response. */
export async function getDocument(jobId: string): Promise<DocumentResponse> {
  const { data } = await api.get<DocumentResponse>(`/jobs/${jobId}/export`)
  return data
}

export async function saveDocument(
  jobId: string,
  text: string,
): Promise<{ jobId: string; savedAt: string | null }> {
  const { data } = await api.put<{ jobId: string; savedAt: string | null }>(
    `/jobs/${jobId}/document`,
    { text },
  )
  return data
}

/** Discards manual edits so the document reverts to the derived version. */
export async function resetDocument(jobId: string): Promise<{ jobId: string }> {
  const { data } = await api.delete<{ jobId: string }>(`/jobs/${jobId}/document`)
  return data
}

/**
 * Fetches the analysed file as a blob.
 *
 * An `<img src>` cannot carry an Authorization header, and a job may be
 * private, so the bytes come through the same client as every other request
 * and become an object URL.
 */
export async function getMediaBlob(jobId: string, full = false): Promise<Blob> {
  const { data } = await api.get<Blob>(`/jobs/${jobId}/media`, {
    responseType: "blob",
    params: full ? { full: 1 } : undefined,
  })
  return data
}

/**
 * Renders the document server-side and returns the file.
 *
 * The text is sent rather than read from storage so a download is exactly
 * what the reviewer has on screen, unsaved edits included. DOCX and PDF
 * generation stays on the server — it needs real layout libraries, and
 * shipping those to the browser for an occasional download is not worth the
 * bundle.
 */
export async function renderDocument(
  jobId: string,
  text: string,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const response = await api.post<Blob>(
    `/jobs/${jobId}/document/render`,
    { text, format },
    { responseType: "blob" },
  )

  const disposition = String(response.headers["content-disposition"] ?? "")
  const match = disposition.match(/filename="?([^"]+)"?/)

  return { blob: response.data, filename: match?.[1] ?? `document.${format}` }
}
