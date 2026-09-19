import { Card, CardContent } from "@/components/ui/card"
import { ScoreGauge } from "@/components/report/ScoreGauge"
import { ConfidenceNote } from "@/components/common/ConfidenceNote"
import { MediaPreview } from "./MediaPreview"
import type { MediaResultResponse } from "@/types/api.types"

/**
 * Headline card for an image result. Detection only — there is deliberately no
 * rewrite affordance anywhere on the media path.
 */
export function ImageScoreCard({ report }: { report: MediaResultResponse }) {
  return (
    <Card>
      <CardContent className="grid gap-6 sm:grid-cols-[180px_1fr]">
        <div className="space-y-2">
          <MediaPreview
            jobId={report.jobId}
            kind="image"
            alt={`The analysed image: ${report.sourceName}`}
          />
          {report.dimensions ? (
            <p className="text-center text-[11px] text-muted-foreground tabular-nums">
              {report.dimensions.width} × {report.dimensions.height}
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {report.score === null ? (
            <p className="text-sm text-muted-foreground">
              No score was produced for this image.
            </p>
          ) : (
            <ScoreGauge
              score={report.score}
              margin={report.confidenceMargin ?? 20}
              label="Likelihood this image was AI-generated"
            />
          )}
          <ConfidenceNote text={report.caveat} />
        </div>
      </CardContent>
    </Card>
  )
}
