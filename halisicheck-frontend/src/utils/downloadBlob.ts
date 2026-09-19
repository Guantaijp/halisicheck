/**
 * Saves a blob to the viewer's downloads.
 *
 * Two details that look like boilerplate and are not:
 *
 * - The anchor is appended to the document before it is clicked. A synthetic
 *   click on a detached anchor is ignored by some browsers, and the download
 *   silently never happens.
 * - The object URL is revoked on a timeout, not immediately. Revoking it in
 *   the same tick can cancel the transfer before the browser has read it,
 *   which is a well-known cause of downloads that appear to fire and produce
 *   no file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.style.display = "none"

  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Long enough for the browser to have taken the bytes.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
