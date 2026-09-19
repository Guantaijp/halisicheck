import { useMemo } from "react"
import { Link, useParams } from "react-router-dom"
import { PenLineIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ConfidenceNote } from "@/components/common/ConfidenceNote"
import { ErrorState } from "@/components/common/ErrorState"
import { Loader } from "@/components/common/Loader"
import { PageHeader } from "@/components/common/PageHeader"
import { RiskDot } from "@/components/common/RiskBadge"
import { HighlightedText } from "@/components/report/HighlightedText"
import { ScoreGauge } from "@/components/report/ScoreGauge"
import { SignalBreakdown } from "@/components/report/SignalBreakdown"
import { SpanList } from "@/components/report/SpanList"
import { useJobPolling } from "@/hooks/useJobPolling"
import { useJobResult } from "@/hooks/useJobResult"
import { useAppStore } from "@/store/useAppStore"
import { isMediaResult } from "@/types/api.types"
import { BAND_META } from "@/utils/constants"
import { buildParagraphs, flaggedSpansFrom } from "@/utils/buildParagraphs"
import { formatRelativeDate, formatWordCount } from "@/utils/formatScore"

export function ReportPage() {
  const { jobId = null } = useParams<{ jobId: string }>()
  const activeSpanId = useAppStore((s) => s.activeSpanId)
  const setActiveSpanId = useAppStore((s) => s.setActiveSpanId)

  const { data: job, isError: jobError, error: jobErr } = useJobPolling(jobId)
  const ready = job?.status === "done"
  const { data: result, isLoading, isError, error, refetch } = useJobResult(jobId, ready)

  // Offsets are rebuilt into paragraphs once per result, not once per render.
  const paragraphs = useMemo(
    () =>
      result && !isMediaResult(result)
        ? buildParagraphs(result.extractedText, result.spans)
        : [],
    [result],
  )

  const flagged = useMemo(
    () => (result && !isMediaResult(result) ? flaggedSpansFrom(result.spans) : []),
    [result],
  )

  if (jobError) return <ErrorState error={jobErr} />
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

  // A media job reached the wrong route; send the reader to the right one.
  if (isMediaResult(result)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          This job is {result.type} content, which has its own report.
        </p>
        <Button nativeButton={false} render={<Link to={`/media/${result.jobId}`} />}>
          Open the {result.type} report
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Detection report"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <FileTextIcon className="size-3.5" aria-hidden />
            {result.sourceName}
            <span aria-hidden>·</span>
            {formatWordCount(result.wordCount)}
            <span aria-hidden>·</span>
            via {result.extractionMethod}
            {result.analysedAt ? (
              <>
                <span aria-hidden>·</span>
                analysed {formatRelativeDate(result.analysedAt)}
              </>
            ) : null}
          </span>
        }
        actions={
          <Button nativeButton={false} render={<Link to={`/rewrite/${result.jobId}`} />}>
            <PenLineIcon aria-hidden />
            Review rewrites
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="order-2 self-start lg:order-1">
          <CardHeader>
            <CardTitle>The document</CardTitle>
            <CardDescription>
              Highlighted runs are the spans the detector flagged. Hover or tap
              one to see why.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Legend />
            <Separator />
            {paragraphs.length > 0 ? (
              <HighlightedText
                paragraphs={paragraphs}
                activeSpanId={activeSpanId}
                onSpanSelect={setActiveSpanId}
              />
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                No text was extracted from this document.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="order-1 space-y-6 lg:order-2">
          <Card>
            <CardContent>
              <ScoreGauge
                score={result.score}
                margin={result.confidenceMargin}
                label="Overall AI-likelihood"
              />
              <Separator className="my-4" />
              <ConfidenceNote text={result.caveat} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signals</CardTitle>
              <CardDescription>
                What each detector contributed. No single signal decides the score.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignalBreakdown signals={result.signals} />
              <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
                Model: {result.modelUsed}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Flagged spans ({flagged.length})
              </CardTitle>
              <CardDescription>
                Highest scoring first. Selecting one jumps to it in the document.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <SpanList
                spans={flagged}
                activeSpanId={activeSpanId}
                onSpanSelect={setActiveSpanId}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {(["low", "medium", "high"] as const).map((band) => (
        <span key={band} className="inline-flex items-center gap-1.5">
          <RiskDot band={band} />
          {BAND_META[band].label}
        </span>
      ))}
    </div>
  )
}
