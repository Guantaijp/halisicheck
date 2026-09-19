import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { cn } from "cn"
import type { FrameScore } from "@/types/media.types"
import { BAND_THRESHOLDS } from "@/utils/constants"
import { formatScore, formatTimestamp } from "@/utils/formatScore"

/**
 * Sampled frame scores over the clip. One measure, one axis. Bar height
 * already encodes the score, so hue is not a second copy of it — it marks the
 * one thing the reader is looking for: frames over the review threshold.
 * Everything else recedes to a single neutral hue.
 *
 * Colours are applied as Tailwind `fill-*` / `stroke-*` CLASSES, never as
 * `fill="var(--x)"` — CSS variables do not resolve inside SVG presentation
 * attributes, which silently paints the whole chart invisible.
 */
export function VideoTimeline({
  frames,
  onFrameSelect,
  activeTimestamp,
}: {
  frames: FrameScore[]
  onFrameSelect?: (frame: FrameScore) => void
  activeTimestamp?: number
}) {
  const flaggedCount = frames.filter((f) => f.flagged).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-[2px] bg-risk-high"
          />
          Over review threshold ({flaggedCount})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-[2px] bg-seq-250"
          />
          Below threshold ({frames.length - flaggedCount})
        </span>
      </div>

      {/* Height includes the x-axis band so the axis labels are never clipped. */}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={frames}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            barCategoryGap={2}
          >
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTimestamp}
              tickLine={false}
              axisLine={{ className: "stroke-axis-line" }}
              tick={{ className: "fill-muted-foreground text-[11px]" }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ className: "fill-muted-foreground text-[11px]" }}
              width={34}
            />
            <ReferenceLine
              y={BAND_THRESHOLDS.high}
              className="stroke-axis-line"
              strokeWidth={1}
              label={{
                value: "review threshold",
                position: "insideTopRight",
                className: "fill-muted-foreground text-[10px]",
              }}
            />
            <Tooltip
              cursor={{ className: "fill-muted opacity-50" }}
              content={<FrameTooltip />}
            />
            <Bar
              dataKey="score"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              onClick={(data) => onFrameSelect?.(data.payload as FrameScore)}
            >
              {frames.map((frame) => (
                <Cell
                  key={frame.timestamp}
                  className={cn(
                    frame.flagged ? "fill-risk-high" : "fill-seq-250",
                    activeTimestamp === frame.timestamp && "stroke-ring",
                    onFrameSelect && "cursor-pointer"
                  )}
                  strokeWidth={activeTimestamp === frame.timestamp ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface TooltipPayload {
  active?: boolean
  payload?: { payload: FrameScore }[]
}

function FrameTooltip({ active, payload }: TooltipPayload) {
  const frame = payload?.[0]?.payload
  if (!active || !frame) return null

  return (
    <div className="rounded-lg border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="font-medium tabular-nums">{formatTimestamp(frame.timestamp)}</p>
      <p className="text-muted-foreground tabular-nums">
        {formatScore(frame.score)} AI-likelihood
      </p>
      {frame.flagged ? (
        <p className="mt-1 font-medium text-risk-high-ink">Over threshold</p>
      ) : null}
    </div>
  )
}
