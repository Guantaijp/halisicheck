import { cn } from "cn"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Paragraph, TextSegment } from "@/types/detection.types"
import { bandForScore } from "@/utils/formatScore"
import { SpanTooltip } from "./SpanTooltip"

const BAND_CLASS = {
  low: "span-flag-low",
  medium: "span-flag-medium",
  high: "span-flag-high",
} as const

interface HighlightedTextProps {
  paragraphs: Paragraph[]
  activeSpanId: string | null
  onSpanSelect: (id: string | null) => void
}

/**
 * The document reader. Flagged runs get a tint AND an underline in the band
 * colour — the underline is the secondary encoding, so the highlight survives
 * colour-vision deficiency and greyscale print.
 */
export function HighlightedText({
  paragraphs,
  activeSpanId,
  onSpanSelect,
}: HighlightedTextProps) {
  return (
    <div className="space-y-4 text-[15px] leading-7">
      {paragraphs.map((paragraph) => (
        <p key={paragraph.id}>
          {paragraph.segments.map((segment) =>
            segment.score === null ? (
              <span key={segment.id}>{segment.text}</span>
            ) : (
              <FlaggedSpan
                key={segment.id}
                segment={segment}
                isActive={activeSpanId === segment.id}
                onSelect={onSpanSelect}
              />
            )
          )}
        </p>
      ))}
    </div>
  )
}

function FlaggedSpan({
  segment,
  isActive,
  onSelect,
}: {
  segment: TextSegment
  isActive: boolean
  onSelect: (id: string | null) => void
}) {
  const band = bandForScore(segment.score ?? 0)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <mark
            id={`span-${segment.id}`}
            data-active={isActive}
            onClick={() => onSelect(isActive ? null : segment.id)}
            className={cn("span-flag text-inherit", BAND_CLASS[band])}
          />
        }
      >
        {segment.text}
      </TooltipTrigger>
      <TooltipContent>
        <SpanTooltip segment={segment} />
      </TooltipContent>
    </Tooltip>
  )
}
