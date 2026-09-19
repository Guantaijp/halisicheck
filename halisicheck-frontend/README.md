# HalisiCheck — web

React + Vite frontend for the HalisiCheck API. Detection reports, per-span review, and dialect rewriting with human accept/reject.

## Running it

The API must be running first — this app has no mock data and no offline mode.

```bash
# terminal 1 — from halisicheck-api
docker compose up -d && pnpm migration:run && pnpm start:dev

# terminal 2 — here
pnpm install
cp .env.example .env     # VITE_API_URL, defaults to http://localhost:3000
pnpm dev
```

Then open http://localhost:5173.

The API's `HALISI_CORS_ORIGINS` must include this origin. It ships allowing `http://localhost:5173` and `:5174`; if you run Vite on another port, add it there.

## The one rule that shapes the UI

**A detection result is never a verdict.** The API returns a score with a confidence interval and no `verdict` field, and the UI is built to keep it that way:

- `ScoreGauge` makes the *interval* the primary mark and the point estimate a tick inside it. A solid bar to a single number would read as certainty the detector does not have.
- Band labels are review instructions — "Worth a look", "Flagged for review" — not claims about authorship.
- Every flagged span shows the reasons that flagged it, so a reviewer can disagree on specifics.
- Nothing is rewritten until a human accepts it, one chunk at a time.

If you add a view that shows a bare percentage, you have broken the product.

## How data flows

```
UploadPage ──POST /jobs/{text,document,image,video}──▶ jobId
     │
     ├─ text: returns done immediately ──▶ /report/:jobId
     └─ upload: returns pending ──▶ useJobPolling ──▶ /report or /media
                                        │
                              GET /jobs/:id every 1.5s
                              until status is done or failed
```

- `api/` — one module per resource, all over a shared axios instance that attaches the bearer token and normalises every error into `ApiError`.
- `hooks/` — TanStack Query wrappers. `useJobPolling` stops polling at a terminal state; `useJobResult` treats a finished analysis as immutable (`staleTime: Infinity`).
- `store/` — zustand, for the auth token, the active dialect, and the selected span. Accept/reject decisions are **not** here: the server owns them, and a local copy would drift from what the export actually applies.

### The final document

`FinalDocument` is the last step: the whole document with accepted rewrites applied, in three views — **Preview** (read it), **Edit** (change it), **Compare** (diff against the original). Copy, download, and save are all there.

Edits persist to the API, so they survive a refresh, and they are stored separately from the extracted text — the report's highlights stay valid no matter what the reader types.

The interesting case is conflict. A reader can edit the document and *then* accept another suggestion, at which point the derived text has moved on but their edits have not. Silently overwriting their work is unacceptable; silently ignoring the new acceptance is worse, because it looks applied and is not. So the panel tracks a **baseline** — the text it last synced from, plus the derived text as it stood at that moment — and when the derived text moves on, it says so and offers *Keep mine* or *Rebuild*.

That baseline is `useState`, not `useRef`. It was a ref first, and dismissing the notice did nothing, because mutating a ref never re-renders.

Accepting a rewrite invalidates **both** the document and the result queries. The second matters because the API may return another suggestion to "awaiting review" — only one rewrite per span can be accepted — and an optimistic update of the clicked row alone would leave the displaced sibling showing stale state.

### Showing the analysed file

Media reports display the image or clip, via `GET /jobs/:id/media`. An `<img src>` cannot carry an Authorization header and a job may be private, so `useMediaFile` fetches the bytes through the same axios client as everything else and turns them into an object URL — revoked on unmount, which is why it is a plain effect rather than a react-query hook.

Images come back as a bounded preview; `?full=1` gets the original.

### Downloads

The Download button offers DOCX, PDF or TXT. The draft is posted to `POST /jobs/:id/document/render` and the file comes back, so what you download is what is on screen — including edits you have not saved.

`utils/downloadBlob.ts` looks like boilerplate and is not. The anchor is appended to the document before it is clicked, because a synthetic click on a detached anchor is ignored by some browsers; and the object URL is revoked on a timeout rather than immediately, because revoking it in the same tick can cancel the transfer before the browser reads it. Both are silent failures.

### `buildParagraphs` is the seam worth knowing about

The API returns one flat `extractedText` plus spans addressed by character offset. The reader renders nested paragraphs and segments. `utils/buildParagraphs.ts` converts between them.

Get it wrong and highlights land on the wrong words — silently, and only for some documents. It is a pure function with 13 tests covering unsorted spans, overlapping spans, spans outside the text, and losslessness (segments must rejoin to the original). Change it with the tests open.

## Auth

Optional by design, matching the API. Anyone can run a check signed out; those jobs work fully but are not listed anywhere, because the API only lists jobs belonging to an account. `/dashboard` explains that rather than showing an empty table.

A 401 on any request clears the stored token and signs the user out, so the UI cannot sit in a state where every request quietly fails.

## Testing

```bash
pnpm test    # vitest — pure logic only
```

Covers `buildParagraphs`. The rest of the confidence comes from driving the real UI against the real API in a headless browser: sign in, run a check, open the report, generate rewrites, accept one, export.

## Known rough edges

- **The diff viewer breaks words mid-character in side-by-side view at narrow widths.** Measured on the same text: ~3 breaks side-by-side, 0 unified, after widening the page to `max-w-7xl`. `word-break` and `overflow-wrap` are already set correctly on every element in the chain and do not fix it — it is the library's table/flex layout. Switch to Unified for a clean read. Replacing `react-diff-viewer-continued` is the real fix.
- **Sentence-by-sentence rewriting cannot lower the burstiness signal**, only the vocabulary ones, so scores plateau around the mid-40s however many times you re-run it. Whole-passage mode is the fix and the UI says so; see the API README for the measurements.
- **Rewrites are slow.** Each flagged span is a separate model call, run sequentially by the API to avoid rate limits. Five spans takes roughly a minute. The page says so while it waits.
- **Video frame thumbnails are placeholders.** The API scores sampled frames and discards them, so the timeline shows tiles rather than the frames. The clip itself does play.
- **Model quality is tier-dependent.** The API falls back to `ministral-8b-latest`, which follows the dialect style guides loosely. Rewrites improve markedly on a larger model — that is an API config change, not a frontend one.
