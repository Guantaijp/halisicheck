import { useEffect, useState } from "react"
import {
  CheckIcon,
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/common/ErrorState"
import { DiffView } from "./DiffView"
import { DownloadMenu } from "./DownloadMenu"
import {
  useDocument,
  useResetDocument,
  useSaveDocument,
} from "@/hooks/useDocument"

type View = "preview" | "edit" | "compare"

interface Baseline {
  text: string
  derived: string
}

function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length
}

/**
 * The finished document: what the reader actually walks away with.
 *
 * Three views over one piece of text — read it, edit it, or see what moved
 * against the original. The reader's own edits are stored separately from the
 * extracted text on the server, so editing here never invalidates the span
 * offsets the report depends on.
 */
export function FinalDocument({ jobId }: { jobId: string }) {
  const { data, isLoading, isError, error, refetch } = useDocument(jobId)
  const save = useSaveDocument(jobId)
  const reset = useResetDocument(jobId)

  const [view, setView] = useState<View>("preview")
  const [draft, setDraft] = useState("")
  const [copied, setCopied] = useState(false)

  /**
   * What the draft was last synced from: the text itself, and the derived text
   * as it stood at that moment.
   *
   * Both are needed. The first tells us whether the reader has edits of their
   * own; the second tells us whether the accepted-suggestion set has moved on
   * since — which is how a reader can accept a suggestion and not notice it is
   * missing from their document.
   *
   * State rather than a ref: dismissing the out-of-step notice updates the
   * baseline, and a ref mutation would leave the notice on screen because
   * nothing re-renders.
   */
  const [baseline, setBaseline] = useState<Baseline | null>(null)

  const serverText = data?.text ?? ""
  const isDirty = data !== undefined && draft !== serverText

  useEffect(() => {
    if (data === undefined) return

    if (baseline === null) {
      setDraft(data.text)
      setBaseline({ text: data.text, derived: data.derivedText })
      return
    }

    // Follow the server only while the reader has nothing of their own at
    // stake; a saved or in-progress edit is never overwritten. The value
    // comparison also stops this from looping on every render.
    const untouched = draft === baseline.text
    const serverMoved =
      baseline.text !== data.text || baseline.derived !== data.derivedText

    if (untouched && !data.isEdited && serverMoved) {
      setDraft(data.text)
      setBaseline({ text: data.text, derived: data.derivedText })
    }
  }, [data, draft, baseline])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          Building the final document…
        </CardContent>
      </Card>
    )
  }

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!data) return null

  /**
   * The accepted-suggestion set changed after the draft was last synced, so
   * the document on screen no longer reflects it.
   */
  const derivedMovedOn =
    baseline !== null && data.derivedText !== baseline.derived

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the text is on screen to select.
    }
  }

  function takeDerived() {
    setDraft(data!.derivedText)
    setBaseline({ text: data!.derivedText, derived: data!.derivedText })
  }

  /** Keeps the edits and stops warning about this particular divergence. */
  function keepMine() {
    setBaseline({ text: draft, derived: data!.derivedText })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Final document
          {data.isEdited ? (
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
              edited by you
            </span>
          ) : null}
          {isDirty ? (
            <span className="rounded-full border border-risk-medium/50 px-2 py-0.5 text-[11px] font-normal text-risk-medium-ink">
              unsaved changes
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          {data.appliedCount} accepted change{data.appliedCount === 1 ? "" : "s"}{" "}
          applied to the original. Edit it as you like — nothing here is sent
          back to the detector.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {derivedMovedOn ? (
          <div className="flex flex-wrap items-start gap-3 rounded-lg border border-risk-medium/40 bg-risk-medium/5 p-3">
            <TriangleAlertIcon
              className="mt-0.5 size-4 shrink-0 text-risk-medium-ink"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Your document is out of step with the accepted suggestions
              </p>
              <p className="text-xs text-muted-foreground">
                The document below still reads as you left it, so it does not
                include that change. Rebuild to take the version with all
                accepted suggestions applied — that discards your edits.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" size="sm" onClick={keepMine}>
                Keep mine
              </Button>
              <Button variant="outline" size="sm" onClick={takeDerived}>
                Rebuild
              </Button>
            </div>
          </div>
        ) : null}

        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="edit">
                <PencilIcon aria-hidden />
                Edit
              </TabsTrigger>
              <TabsTrigger value="compare">Compare</TabsTrigger>
            </TabsList>

            <span className="text-xs text-muted-foreground tabular-nums">
              {wordCount(draft).toLocaleString()} words
            </span>
          </div>

          <TabsContent value="preview" className="pt-3">
            <article className="max-h-[32rem] space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-5 text-[15px] leading-7">
              {draft.split(/\n\s*\n/).map((paragraph, index) =>
                paragraph.trim().length > 0 ? (
                  <p key={index} className="whitespace-pre-wrap">
                    {paragraph.trim()}
                  </p>
                ) : null,
              )}
            </article>
          </TabsContent>

          <TabsContent value="edit" className="pt-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
              aria-label="Final document"
              className="min-h-[24rem] resize-y font-sans text-[15px] leading-7"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Edits are stored against this job, separately from the original —
              the report's highlights stay valid either way.
            </p>
          </TabsContent>

          <TabsContent value="compare" className="pt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              The extracted original on the left, your final document on the
              right.
            </p>
            <DiffView
              original={data.originalText}
              suggestion={draft}
              splitView={false}
            />
          </TabsContent>
        </Tabs>

        {save.isError ? <ErrorState error={save.error} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <DownloadMenu jobId={jobId} text={draft} />
            {data.isEdited ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  reset.mutate(undefined, {
                    onSuccess: () => {
                      // Force a clean re-sync from the derived text.
                      setBaseline(null)
                    },
                  })
                }
                disabled={reset.isPending}
              >
                <RotateCcwIcon aria-hidden />
                Discard my edits
              </Button>
            ) : null}
          </div>

          <Button
            onClick={() => save.mutate(draft)}
            disabled={!isDirty || save.isPending}
          >
            {save.isPending ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <CheckIcon aria-hidden />
            )}
            {isDirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
