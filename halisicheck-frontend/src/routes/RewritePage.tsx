import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import {
  ArrowLeftIcon,
  ColumnsIcon,
  Loader2Icon,
  RowsIcon,
  SparklesIcon,
} from "lucide-react"
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
import { RiskBadge } from "@/components/common/RiskBadge"
import { AcceptRejectControls } from "@/components/rewrite/AcceptRejectControls"
import { DialectToggle } from "@/components/rewrite/DialectToggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DiffView } from "@/components/rewrite/DiffView"
import { FinalDocument } from "@/components/rewrite/FinalDocument"
import { useJobPolling } from "@/hooks/useJobPolling"
import { useJobResult } from "@/hooks/useJobResult"
import { useDecideRewrite, useGenerateRewrites } from "@/hooks/useRewrite"
import { useAppStore } from "@/store/useAppStore"
import {
  isMediaResult,
  type ApiRewrite,
  type RewriteScope,
} from "@/types/api.types"
import type { ChunkDecision } from "@/types/detection.types"
import { formatScore } from "@/utils/formatScore"

export function RewritePage() {
  const { jobId = "" } = useParams<{ jobId: string }>()
  const [splitView, setSplitView] = useState(true)
  const [scope, setScope] = useState<RewriteScope>("spans")

  const dialect = useAppStore((s) => s.dialect)
  const setDialect = useAppStore((s) => s.setDialect)

  const { data: job } = useJobPolling(jobId || null)
  const ready = job?.status === "done"
  const { data: result, isLoading, isError, error, refetch } = useJobResult(jobId, ready)

  const generate = useGenerateRewrites(jobId)
  const decide = useDecideRewrite(jobId)

  const spans = result && !isMediaResult(result) ? result.spans : []
  const allRewrites = result && !isMediaResult(result) ? result.rewrites : []

  // Only the active dialect is on screen; switching re-renders from what the
  // server already returned rather than re-requesting.
  const rewrites = useMemo(
    () =>
      allRewrites.filter(
        (r) =>
          r.dialect === dialect &&
          (scope === "passage" ? r.scope === "passage" : r.scope === "span"),
      ),
    [allRewrites, dialect, scope],
  )

  const scoreForSpan = useMemo(
    () => new Map(spans.map((s) => [s.id, s.score])),
    [spans],
  )

  const accepted = rewrites.filter((r) => r.accepted === true).length
  const rejected = rewrites.filter((r) => r.accepted === false).length
  const pending = rewrites.length - accepted - rejected

  if (!ready || isLoading) return <Loader label="Loading report" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!result) return <Loader label="Loading report" />

  if (isMediaResult(result)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          There is no rewrite path for {result.type} content — detection only.
        </p>
        <Button nativeButton={false} render={<Link to={`/media/${result.jobId}`} />}>
          Back to the report
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Review rewrites"
        description="Nothing is changed until you accept it. Each suggestion is shown against the original so you can see exactly what would move."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to={`/report/${jobId}`} />}
          >
            <ArrowLeftIcon aria-hidden />
            Back to report
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <ScopeSwitch scope={scope} onScopeChange={setScope} />
          <Separator />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <DialectToggle dialect={dialect} onDialectChange={setDialect} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSplitView((v) => !v)}
              disabled={rewrites.length === 0}
            >
              {splitView ? <RowsIcon aria-hidden /> : <ColumnsIcon aria-hidden />}
              {splitView ? "Unified" : "Side by side"}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              size="sm"
              onClick={() => generate.mutate({ dialect, scope })}
              disabled={
                generate.isPending || (scope === "spans" && spans.length === 0)
              }
            >
              {generate.isPending ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <SparklesIcon aria-hidden />
              )}
              {rewrites.length > 0 ? "Regenerate" : "Generate suggestions"}
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {generate.isError ? <ErrorState error={generate.error} /> : null}

      {generate.isPending ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            <div>
              <p className="text-sm font-medium">
                {scope === "passage"
                  ? "Rewriting the whole passage…"
                  : `Rewriting ${spans.length} span${spans.length === 1 ? "" : "s"}…`}
              </p>
              <p className="text-xs text-muted-foreground">
                {scope === "passage"
                  ? "One call over the whole document."
                  : "Each span is a separate model call, so this takes a few seconds per suggestion."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {rewrites.length === 0 && !generate.isPending ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">
              {scope === "passage"
                ? "No whole-passage rewrite yet."
                : spans.length === 0
                  ? "Nothing was flagged in this document."
                  : "No suggestions yet."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scope === "passage"
                ? `Rewrite the whole document in ${dialect === "british" ? "British" : "Kenyan"} English, in one pass.`
                : spans.length === 0
                  ? "There is nothing to rewrite."
                  : `Generate suggestions to review ${spans.length} flagged span${spans.length === 1 ? "" : "s"} in ${dialect === "british" ? "British" : "Kenyan"} English.`}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {rewrites.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <Count n={accepted} label="accepted" />
            <Count n={rejected} label="rejected" />
            <Count n={pending} label="still to review" />
          </div>

          <div className="space-y-5">
            {rewrites.map((rewrite, index) => (
              <RewriteCard
                key={rewrite.id}
                rewrite={rewrite}
                index={index}
                splitView={splitView}
                originalScore={
                  rewrite.spanId ? scoreForSpan.get(rewrite.spanId) : undefined
                }
                onDecide={(decision) =>
                  decide.mutate({
                    rewriteId: rewrite.id,
                    accepted: decision === "pending" ? null : decision === "accepted",
                  })
                }
              />
            ))}
          </div>

          <ConfidenceNote
            text="A rewrite lowers the detector's score, but it does not make text honest. Read every accepted change before you use it — the point of the diff is that meaning can shift."
          />
        </>
      ) : null}

      <FinalDocument jobId={jobId} />
    </div>
  )
}

/**
 * Per-sentence vs whole-passage.
 *
 * The trade-off is stated rather than hidden, because it is real: per-sentence
 * rewriting cannot change sentence-length variation at all — a model shown one
 * sentence has no view of its neighbours — while whole-passage rewriting can,
 * and is correspondingly freer with the source.
 */
function ScopeSwitch({
  scope,
  onScopeChange,
}: {
  scope: RewriteScope
  onScopeChange: (scope: RewriteScope) => void
}) {
  const options: { value: RewriteScope; label: string; hint: string }[] = [
    {
      value: "spans",
      label: "Sentence by sentence",
      hint: "Safest. Fixes wording on the flagged sentences only — it cannot change the rhythm of the document.",
    },
    {
      value: "passage",
      label: "Whole passage",
      hint: "Rewrites everything in one pass, varying sentence length. Far more effective, and freer with your text — read the diff.",
    },
  ]
  const active = options.find((o) => o.value === scope)

  return (
    <div className="space-y-1.5">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[scope]}
        onValueChange={(value) => {
          const next = value[0] as RewriteScope | undefined
          if (next) onScopeChange(next)
        }}
        aria-label="Rewrite scope"
      >
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {active ? (
        <p className="max-w-2xl text-[11px] text-muted-foreground">{active.hint}</p>
      ) : null}
    </div>
  )
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className="tabular-nums">
      <strong className="font-semibold text-foreground">{n}</strong> {label}
    </span>
  )
}

function RewriteCard({
  rewrite,
  index,
  splitView,
  originalScore,
  onDecide,
}: {
  rewrite: ApiRewrite
  index: number
  splitView: boolean
  originalScore?: number
  onDecide: (decision: ChunkDecision) => void
}) {
  const decision: ChunkDecision =
    rewrite.accepted === null ? "pending" : rewrite.accepted ? "accepted" : "rejected"

  // The API leads the rationale with any fidelity concern — a self-reported
  // addition, invented figures, or heavy compression. Those are the one thing
  // a reviewer must not skim past.
  const rationale = rewrite.rationale ?? ""
  const meaningWarning =
    rationale.startsWith("CHECK MEANING") ||
    /Figures appear|content words appear|shorter than the original|longer than the original/.test(
      rationale,
    )
  const isPassage = rewrite.scope === "passage"

  return (
    <Card id={rewrite.id}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{isPassage ? "Whole-passage rewrite" : `Suggestion ${index + 1}`}</span>
          {originalScore !== undefined ? (
            <>
              <RiskBadge score={originalScore} size="sm" />
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                original scored {formatScore(originalScore)}
              </span>
            </>
          ) : null}
        </CardTitle>
        {rationale ? (
          <CardDescription
            className={
              meaningWarning ? "font-medium text-risk-high-ink" : undefined
            }
          >
            {meaningWarning ? "⚠ " : ""}
            {rationale}
          </CardDescription>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <DiffView
          original={rewrite.originalText}
          suggestion={rewrite.rewrittenText}
          splitView={splitView}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {rewrite.dialect === "british" ? "British" : "Kenyan"} English
            {isPassage ? " · replaces the whole document" : ""}
          </p>
          <AcceptRejectControls decision={decision} onDecide={onDecide} />
        </div>
      </CardContent>
    </Card>
  )
}
