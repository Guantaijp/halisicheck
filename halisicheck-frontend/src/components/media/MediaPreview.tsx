import { ImageOffIcon, Loader2Icon } from "lucide-react"
import { cn } from "cn"
import { useMediaFile } from "@/hooks/useMediaFile"

/**
 * The file that was analysed.
 *
 * Worth showing rather than describing: a reader deciding whether to trust a
 * score needs to see what produced it, and for image detection the artefacts
 * the report cites are only checkable against the picture itself.
 */
export function MediaPreview({
  jobId,
  kind,
  alt,
  className,
}: {
  jobId: string
  kind: "image" | "video"
  alt: string
  className?: string
}) {
  const { url, isLoading, error } = useMediaFile(jobId)

  if (isLoading) {
    return (
      <div
        className={cn(
          "grid aspect-[3/2] place-items-center rounded-lg border bg-muted/30",
          className,
        )}
      >
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  if (error || !url) {
    return (
      <div
        className={cn(
          "grid aspect-[3/2] place-items-center gap-2 rounded-lg border border-dashed px-3 text-center",
          className,
        )}
        role="img"
        aria-label={`${alt} — preview unavailable`}
      >
        <ImageOffIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-[11px] text-muted-foreground">
          Preview unavailable. The analysis is unaffected.
        </p>
      </div>
    )
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className={cn("w-full rounded-lg border bg-black", className)}
        aria-label={alt}
      />
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn(
        "w-full rounded-lg border bg-muted/30 object-contain",
        className,
      )}
    />
  )
}
