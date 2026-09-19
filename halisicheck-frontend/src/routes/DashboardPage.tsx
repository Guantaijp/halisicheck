import { Link } from "react-router-dom"
import { ArrowUpRightIcon, InboxIcon, LockIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/common/ErrorState"
import { JobStatusBadge } from "@/components/common/JobStatusBadge"
import { Loader } from "@/components/common/Loader"
import { PageHeader } from "@/components/common/PageHeader"
import { RiskDot } from "@/components/common/RiskBadge"
import { useJobs } from "@/hooks/useJobs"
import { useAppStore } from "@/store/useAppStore"
import type { JobStatusResponse } from "@/types/api.types"
import { JOB_TYPE_LABEL } from "@/utils/constants"
import { formatRelativeDate, formatScore } from "@/utils/formatScore"

function reportPath(job: JobStatusResponse): string {
  return job.type === "image" || job.type === "video"
    ? `/media/${job.id}`
    : `/report/${job.id}`
}

export function DashboardPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const { data: jobs, isLoading, isError, error, refetch } = useJobs()

  if (!isAuthenticated) return <SignedOutState />
  if (isLoading) return <Loader label="Loading history" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  const rows = jobs ?? []
  const done = rows.filter((j) => j.status === "done")
  const flagged = done.filter((j) => (j.summary?.score ?? 0) >= 70).length

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="History"
        description="Everything you have checked, newest first."
        actions={
          <Button nativeButton={false} render={<Link to="/" />}>
            New check
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Checks run" value={rows.length.toString()} />
        <StatTile label="Completed" value={done.length.toString()} />
        <StatTile
          label="Flagged for review"
          value={flagged.toString()}
          hint="scored 70 or above"
        />
      </div>

      <Card>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Likelihood</TableHead>
                  <TableHead className="text-right">When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="max-w-[22rem]">
                      <span className="block truncate font-medium">
                        {job.sourceName}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {job.id.slice(0, 8)}
                        {job.summary && job.summary.flaggedSpans > 0
                          ? ` · ${job.summary.flaggedSpans} flagged span${job.summary.flaggedSpans === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {JOB_TYPE_LABEL[job.type]}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {job.summary?.score == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          {job.summary.band ? <RiskDot band={job.summary.band} /> : null}
                          {formatScore(job.summary.score)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatRelativeDate(job.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.status === "done" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Open report for ${job.sourceName}`}
                          nativeButton={false}
                          render={<Link to={reportPath(job)} />}
                        >
                          <ArrowUpRightIcon aria-hidden />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-3xl leading-none font-semibold tracking-tight">{value}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

/** History is per-account, so an anonymous visitor is told why it is empty. */
function SignedOutState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <LockIcon className="size-6 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">History needs an account</h1>
      <p className="text-sm text-muted-foreground">
        Checks you run signed out still work — they just are not saved to a
        profile, so there is nothing to list here.
      </p>
      <div className="flex gap-2">
        <Button nativeButton={false} render={<Link to="/login" />}>
          Sign in
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
          Run a check
        </Button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <InboxIcon className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">Nothing checked yet</p>
      <Button size="sm" nativeButton={false} render={<Link to="/" />}>
        Run your first check
      </Button>
    </div>
  )
}
