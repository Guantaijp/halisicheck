import { Textarea } from "@/components/ui/textarea"

const SAMPLE = `In today's rapidly evolving digital landscape, it is important to note that mobile money has fundamentally transformed the financial inclusion ecosystem across the African continent. This groundbreaking innovation has revolutionised the way individuals and businesses interact with financial services.`

export function TextInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the text you want checked…"
        className="min-h-56 resize-y text-[15px] leading-relaxed"
        aria-label="Text to analyse"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {words.toLocaleString()} word{words === 1 ? "" : "s"}
          {words > 0 && words < 50 ? " · short passages score less reliably" : ""}
        </span>
        <button
          type="button"
          onClick={() => onChange(SAMPLE)}
          className="underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Use sample text
        </button>
      </div>
    </div>
  )
}
