import { useState } from "react"
import { ChevronDownIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { renderDocument } from "@/api/jobs.api"
import { ApiError } from "@/api/client"
import type { ExportFormat } from "@/types/api.types"
import { downloadBlob } from "@/utils/downloadBlob"

const FORMATS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: "docx", label: "Word (.docx)", hint: "Headings kept as headings" },
  { format: "pdf", label: "PDF (.pdf)", hint: "Fixed layout, ready to send" },
  { format: "txt", label: "Plain text (.txt)", hint: "No formatting" },
]

/**
 * Download in a choice of format.
 *
 * The text is posted to the API rather than generated here: DOCX and PDF need
 * real layout libraries, and the server already knows which lines are headings
 * — the same classifier that keeps the rewriter away from them lays them out
 * as headings in the output, which a .txt cannot carry.
 */
export function DownloadMenu({ jobId, text }: { jobId: string; text: string }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(format: ExportFormat) {
    setBusy(format)
    setError(null)

    try {
      const { blob, filename } = await renderDocument(jobId, text, format)
      downloadBlob(blob, filename)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The download could not be prepared.",
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" disabled={busy !== null}>
              {busy !== null ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <DownloadIcon aria-hidden />
              )}
              Download
              <ChevronDownIcon aria-hidden />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56">
          {FORMATS.map(({ format, label, hint }) => (
            <DropdownMenuItem
              key={format}
              onClick={() => void download(format)}
              disabled={busy !== null}
            >
              <span className="flex flex-col">
                <span>{label}</span>
                <span className="text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}
