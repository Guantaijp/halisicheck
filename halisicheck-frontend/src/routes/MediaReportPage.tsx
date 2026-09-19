import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ImageIcon, VideoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ConfidenceNote } from "@/components/common/ConfidenceNote"
import { ErrorState } from "@/components/common/ErrorState"
import { Loader } from "@/components/common/Loader"
import { PageHeader } from "@/components/common/PageHeader"
import { FrameThumbnail } from "@/components/media/FrameThumbnail"
import { ImageScoreCard } from "@/components/media/ImageScoreCard"
import { MediaPreview } from "@/components/media/MediaPreview"
import { SignalList } from "@/components/media/SignalList"
import { VideoTimeline } from "@/components/media/VideoTimeline"
import { ScoreGauge } from "@/components/report/ScoreGauge"
import { useJobPolling } from "@/hooks/useJobPolling"
import { useJobResult } from "@/hooks/useJobResult"
import { isMediaResult } from "@/types/api.types"
import type { FrameScore } from "@/types/media.types"
import { formatRelativeDate, formatScore, formatTimestamp } from "@/utils/formatScore"

export function MediaReportPage() {
  const { jobId = null } = useParams<{ jobId: string }>()
  const [activeFrame, setActiveFrame] = useState<FrameScore | null>(null)

  const { data: job } = useJobPolling(jobId)
  const ready = job?.status === "done"
  const { data: result, isLoading, isError, error, refetch } = useJobResult(jobId, ready)

  if (job?.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl">
        <ErrorState error={new Error(job.error ?? "This job failed.")} />
      </div>
    )
  }
  if (!ready || isLoading) return <Loader label="Loading report" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!result) return <Loader label="Loading report" />

  if (!isMediaResult(result)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          This job is text content, which has its own report.
        </p>
        <Button nativeButton={false} render={<Link to={`/report/${result.jobId}`} />}>
          Open the detection report
        </Button>
      </div>
    )
  }

  const isVideo = result.type === "video"
  const frames = result.frames ?? []
  const flagged = frames.filter((f) => f.flagged)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={isVideo ? "Video report" : "Image report"}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {isVideo ? (
              <VideoIcon className="size-3.5" aria-hidden />
            ) : (
              <ImageIcon className="size-3.5" aria-hidden />
            )}
            {result.sourceName}
            {result.durationSeconds ? (
              <>
                <span aria-hidden>·</span>
                {formatTimestamp(result.durationSeconds)}
              </>
            ) : null}
            {result.dimensions ? (
              <>
                <span aria-hidden>·</span>
                {result.dimensions.width} × {result.dimensions.height}
              </>
            ) : null}
            {result.analysedAt ? (
              <>
                <span aria-hidden>·</span>
                analysed {formatRelativeDate(result.analysedAt)}
              </>
            ) : null}
          </span>
        }
      />

      <Alert>
        <AlertTitle>Detection only</AlertTitle>
        <AlertDescription>
          There is no rewrite path for images or video — the system reports what
          it found and leaves the judgement to you.
        </AlertDescription>
      </Alert>

      {isVideo ? (
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <MediaPreview
              jobId={result.jobId}
              kind="video"
              alt={`The analysed clip: ${result.sourceName}`}
              className="self-start"
            />
            <div className="space-y-5">
            {result.score === null ? (
              <p className="text-sm text-muted-foreground">
                No score was produced for this clip.
              </p>
            ) : (
              <ScoreGauge
                score={result.score}
                margin={result.confidenceMargin ?? 20}
                label="Likelihood this clip was AI-generated"
              />
            )}
            <ConfidenceNote text={result.caveat} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <ImageScoreCard report={result} />
      )}

      {isVideo && frames.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frame timeline</CardTitle>
            <CardDescription>
              One bar per sampled frame. Select a bar to pin it below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <VideoTimeline
              frames={frames}
              onFrameSelect={setActiveFrame}
              activeTimestamp={activeFrame?.timestamp}
            />

            {flagged.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Frames over the review threshold ({flagged.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {flagged.map((frame) => (
                    <FrameThumbnail
                      key={frame.timestamp}
                      frame={frame}
                      isActive={activeFrame?.timestamp === frame.timestamp}
                      onSelect={setActiveFrame}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {activeFrame ? (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm tabular-nums">
                {formatTimestamp(activeFrame.timestamp)} —{" "}
                {formatScore(activeFrame.score)} AI-likelihood
                {activeFrame.flagged ? " · over threshold" : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What fired</CardTitle>
          <CardDescription>
            Each signal and what it does — and does not — tell you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignalList signals={result.signals} />
          {result.audioNote ? (
            <p className="rounded-lg border-l-2 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <strong className="font-medium text-foreground">Audio: </strong>
              {result.audioNote}
            </p>
          ) : null}
          {result.modelUsed ? (
            <p className="border-t pt-3 text-[11px] text-muted-foreground">
              Model: {result.modelUsed}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
