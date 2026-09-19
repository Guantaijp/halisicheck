import { AlertCircleIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/api/client"

/**
 * One place that turns a thrown error into something a reader can act on.
 * An unreachable API and a rejected file need different advice, so they get it.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const apiError = error instanceof ApiError ? error : null
  const message =
    apiError?.message ??
    (error instanceof Error ? error.message : "Something went wrong.")

  const hint =
    apiError?.status === 0
      ? "Start the API with `pnpm start:dev` in halisicheck-api, then try again."
      : apiError?.status === 422
        ? "This usually means MISTRAL_API_KEY is not set on the API."
        : apiError?.status === 404
          ? "The job may have been cleared, or it belongs to another account."
          : null

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <AlertCircleIcon className="size-6 text-destructive" aria-hidden />
      <p className="max-w-md text-sm font-medium">{message}</p>
      {hint ? <p className="max-w-md text-xs text-muted-foreground">{hint}</p> : null}

      {apiError && apiError.details.length > 1 ? (
        <ul className="max-w-md space-y-0.5 text-xs text-muted-foreground">
          {apiError.details.slice(1).map((detail) => (
            <li key={detail}>· {detail}</li>
          ))}
        </ul>
      ) : null}

      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  )
}
