import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRightIcon, Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfidenceNote } from "@/components/common/ConfidenceNote"
import { ErrorState } from "@/components/common/ErrorState"
import { PageHeader } from "@/components/common/PageHeader"
import { UploadTabs, type UploadMode } from "@/components/upload/UploadTabs"
import { useUpload } from "@/hooks/useUpload"
import { useJobPolling } from "@/hooks/useJobPolling"

export function UploadPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<UploadMode>("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const upload = useUpload()
  // Text jobs come back finished; uploads come back pending and are polled.
  const { data: job } = useJobPolling(jobId)

  const status = job?.status ?? (upload.isPending ? "pending" : null)
  const isRunning = upload.isPending || status === "pending" || status === "processing"

  useEffect(() => {
    if (!job) return

    if (job.status === "done") {
      const path =
        job.type === "image" || job.type === "video"
          ? `/media/${job.id}`
          : `/report/${job.id}`
      navigate(path)
    }
  }, [job, navigate])

  const canSubmit = mode === "text" ? text.trim().length > 0 : file !== null

  function handleSubmit() {
    if (!canSubmit || isRunning) return
    setJobId(null)

    upload.mutate(
      { mode, text, file },
      {
        onSuccess: (created) => {
          // A finished text job can go straight to its report.
          if (created.status === "done") {
            navigate(`/report/${created.id}`)
            return
          }
          setJobId(created.id)
        },
      },
    )
  }

  const failed = job?.status === "failed"

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Check content"
        description="Paste text, or upload a document, image or video. Text and documents get a detection report plus an optional rewrite; images and video are detection only."
      />

      <Card>
        <CardHeader>
          <CardTitle>What are we checking?</CardTitle>
          <CardDescription>
            Longer passages score more reliably than a couple of sentences.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <UploadTabs
            mode={mode}
            onModeChange={(next) => {
              setMode(next)
              setJobId(null)
            }}
            text={text}
            onTextChange={setText}
            file={file}
            onFileChange={setFile}
          />

          {isRunning ? (
            <ProgressPanel
              phase={
                upload.isPending && upload.uploadProgress < 100 && mode !== "text"
                  ? `Uploading — ${upload.uploadProgress}%`
                  : status === "pending"
                    ? "Queued"
                    : "Analysing"
              }
              percent={
                upload.isPending && mode !== "text"
                  ? upload.uploadProgress
                  : (job?.progress ?? 10)
              }
            />
          ) : null}

          {upload.isError ? <ErrorState error={upload.error} /> : null}

          {failed ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">
                That job could not be completed.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{job?.error}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <ConfidenceNote className="max-w-sm" />
            <Button onClick={handleSubmit} disabled={!canSubmit || isRunning}>
              {isRunning ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <SparklesIcon aria-hidden />
              )}
              Run check
              {!isRunning ? <ArrowRightIcon aria-hidden /> : null}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProgressPanel({ phase, percent }: { phase: string; percent: number }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        {phase}…
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.max(5, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Documents and video are queued, so this can take a while. You can leave
        this page — the job appears in your history.
      </p>
    </div>
  )
}
