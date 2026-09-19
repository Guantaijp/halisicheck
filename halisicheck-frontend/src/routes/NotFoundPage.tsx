import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        That page does not exist
      </h1>
      <p className="text-sm text-muted-foreground">
        The link may be stale, or the job may have been cleared.
      </p>
      <Button nativeButton={false} render={<Link to="/" />}>Back to checks</Button>
    </div>
  )
}
