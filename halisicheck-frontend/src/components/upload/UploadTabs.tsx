import { FileTextIcon, ImageIcon, TypeIcon, VideoIcon } from "lucide-react"
import type { Accept } from "react-dropzone"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import type { JobType } from "@/types/job.types"
import { FileDropzone } from "./FileDropzone"
import { TextInput } from "./TextInput"

export type UploadMode = "text" | "document" | "image" | "video"

/** Which job type each tab produces — documents resolve by extension. */
export function jobTypeForMode(mode: UploadMode, file: File | null): JobType {
  if (mode === "text") return "text"
  if (mode === "image") return "image"
  if (mode === "video") return "video"
  return file?.name.toLowerCase().endsWith(".pdf") ? "pdf" : "docx"
}

const DOC_ACCEPT: Accept = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "text/plain": [".txt", ".md"],
}
const IMAGE_ACCEPT: Accept = { "image/*": [".jpg", ".jpeg", ".png", ".webp"] }
const VIDEO_ACCEPT: Accept = { "video/*": [".mp4", ".mov", ".webm"] }

interface UploadTabsProps {
  mode: UploadMode
  onModeChange: (mode: UploadMode) => void
  text: string
  onTextChange: (text: string) => void
  file: File | null
  onFileChange: (file: File | null) => void
}

export function UploadTabs({
  mode,
  onModeChange,
  text,
  onTextChange,
  file,
  onFileChange,
}: UploadTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        onModeChange(value as UploadMode)
        onFileChange(null)
      }}
    >
      <TabsList>
        <TabsTrigger value="text">
          <TypeIcon aria-hidden />
          Text
        </TabsTrigger>
        <TabsTrigger value="document">
          <FileTextIcon aria-hidden />
          Document
        </TabsTrigger>
        <TabsTrigger value="image">
          <ImageIcon aria-hidden />
          Image
        </TabsTrigger>
        <TabsTrigger value="video">
          <VideoIcon aria-hidden />
          Video
        </TabsTrigger>
      </TabsList>

      <TabsContent value="text" className="pt-2">
        <TextInput value={text} onChange={onTextChange} />
      </TabsContent>

      <TabsContent value="document" className="pt-2">
        <FileDropzone
          accept={DOC_ACCEPT}
          hint="DOCX, PDF, TXT or MD · scanned PDFs fall back to OCR"
          file={file}
          onFileChange={onFileChange}
        />
      </TabsContent>

      <TabsContent value="image" className="pt-2">
        <FileDropzone
          accept={IMAGE_ACCEPT}
          hint="JPG, PNG or WebP · detection only, no rewrite for media"
          file={file}
          onFileChange={onFileChange}
        />
      </TabsContent>

      <TabsContent value="video" className="pt-2">
        <FileDropzone
          accept={VIDEO_ACCEPT}
          hint="MP4, MOV or WebM · frames are sampled, so long clips take longer"
          file={file}
          onFileChange={onFileChange}
        />
      </TabsContent>
    </Tabs>
  )
}
