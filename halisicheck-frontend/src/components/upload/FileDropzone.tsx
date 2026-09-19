import { useCallback } from "react"
import { useDropzone, type Accept } from "react-dropzone"
import { FileIcon, UploadCloudIcon, XIcon } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"

interface FileDropzoneProps {
  accept: Accept
  hint: string
  file: File | null
  onFileChange: (file: File | null) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileDropzone({
  accept,
  hint,
  file,
  onFileChange,
}: FileDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFileChange(accepted[0])
    },
    [onFileChange]
  )

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({ onDrop, accept, maxFiles: 1, multiple: false })

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-background">
          <FileIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatBytes(file.size)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onFileChange(null)}
          aria-label="Remove file"
        >
          <XIcon aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
          isDragActive
            ? "border-primary bg-muted"
            : "hover:border-muted-foreground/40 hover:bg-muted/40"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloudIcon className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          {isDragActive ? "Drop it here" : "Drag a file here, or click to choose"}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>

      {fileRejections.length > 0 ? (
        <p className="text-xs text-destructive">
          {fileRejections[0].errors[0]?.message ?? "That file type is not supported."}
        </p>
      ) : null}
    </div>
  )
}
