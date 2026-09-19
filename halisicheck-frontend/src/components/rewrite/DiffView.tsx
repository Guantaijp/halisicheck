import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued"

/**
 * Word-level diff of original vs suggestion. Colours are passed as CSS vars so
 * the diff follows the theme without a JS dark-mode probe, and the added and
 * removed sides are distinguished by position and label as well as by tint.
 */
const diffStyles = {
  variables: {
    light: {
      diffViewerBackground: "var(--card)",
      diffViewerColor: "var(--card-foreground)",
      addedBackground: "color-mix(in oklch, var(--risk-low) 12%, transparent)",
      addedColor: "var(--card-foreground)",
      removedBackground: "color-mix(in oklch, var(--risk-high) 12%, transparent)",
      removedColor: "var(--card-foreground)",
      wordAddedBackground: "color-mix(in oklch, var(--risk-low) 28%, transparent)",
      wordRemovedBackground: "color-mix(in oklch, var(--risk-high) 26%, transparent)",
      gutterBackground: "var(--muted)",
      gutterColor: "var(--muted-foreground)",
      addedGutterBackground: "color-mix(in oklch, var(--risk-low) 18%, transparent)",
      removedGutterBackground: "color-mix(in oklch, var(--risk-high) 18%, transparent)",
      codeFoldBackground: "var(--muted)",
      emptyLineBackground: "var(--muted)",
    },
  },
  contentText: {
    fontFamily: "var(--font-sans)",
    fontSize: "14px",
    lineHeight: "1.65",
    // The library still breaks words mid-character when a column is narrow,
    // despite these. Measured: ~5 breaks side-by-side vs ~1 unified at the
    // same text. Width is the real variable, so the page gives the diff as
    // much room as it can rather than fighting the library's layout.
    wordBreak: "normal" as const,
    overflowWrap: "break-word" as const,
  },
  line: { wordBreak: "normal" as const, overflowWrap: "break-word" as const },
  content: { wordBreak: "normal" as const, overflowWrap: "break-word" as const },
  gutter: { minWidth: "2.25rem", padding: "0 0.5rem" },
}

export function DiffView({
  original,
  suggestion,
  splitView,
}: {
  original: string
  suggestion: string
  splitView: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-lg border text-sm">
      <ReactDiffViewer
        oldValue={original}
        newValue={suggestion}
        splitView={splitView}
        compareMethod={DiffMethod.WORDS}
        hideLineNumbers
        hideSummary
        showDiffOnly
        leftTitle={splitView ? "Original" : undefined}
        rightTitle={splitView ? "Suggested rewrite" : undefined}
        styles={diffStyles}
      />
    </div>
  )
}
