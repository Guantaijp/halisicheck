# HalisiCheck API

AI content detection and rewrite. NestJS, PostgreSQL, BullMQ, Mistral.

From the Swahili *halisi* — genuine, authentic.

The service does three things:

- **Detects** how likely text, DOCX and PDF content is to be AI-generated.
- **Rewrites** flagged text into natural British or Kenyan English, with human review before any change is applied.
- **Detects** how likely an image or video is to be AI-generated. Detection only — there is no rewrite path for media.

## The one rule that shapes the whole design

**A detection result is never a verdict.** Every score is returned with a confidence interval and a caveat, and there is no `verdict` field anywhere in the API. Bands are named as review instructions (`low`, `medium`, `high`), not as claims about authorship.

This is not decoration. It is enforced in three places:

- `scoring.util.ts` widens the interval when signals disagree, and widens it further when weight rests on signals that reported themselves unreliable. A score built from thin evidence cannot present itself as a firm number.
- Every flagged span carries the specific reasons that flagged it, so a reviewer can disagree on specifics rather than in the abstract.
- Rewrites are stored with `accepted = null` and are never applied to a document until a human accepts them individually.

If you add a feature that returns a bare number, you have broken the product.

## Running it

Requires Node 22+, pnpm, and Docker for Postgres and Redis.

```bash
pnpm install
cp .env.example .env          # then fill in MISTRAL_API_KEY
docker compose up -d          # Postgres on 5433, Redis on 6380
pnpm migration:run
pnpm start:dev
```

API docs (Swagger) at http://localhost:3000/docs, health at http://localhost:3000/health.

> Host ports are offset to **5433** and **6380** so this stack runs alongside another project holding the defaults. Inside the compose network the services still use 5432 and 6379.

### ffmpeg

Video jobs shell out to `ffmpeg` and `ffprobe`. Install them and put them on `PATH`, or set `HALISI_FFMPEG_PATH` and `HALISI_FFPROBE_PATH`. Without them, video jobs fail with an explicit message; everything else is unaffected.

### Running without a Mistral key

Supported, and distinct from being broken. Ingestion, extraction, OCR, queuing, job history and image metadata inspection all work. The LLM judge, rewrites and image/video classification do not — detection falls back to its statistical signals and widens the confidence interval to say so. `GET /health` reports which capabilities are live.

## Model choice

Model availability is tier-dependent, and this bites in practice:

| Model | Observed on a low tier |
|---|---|
| `mistral-large-latest` | `403 tier_not_allowed` |
| `mistral-medium-latest`, `mistral-small-latest` | `429` |
| `ministral-8b-latest` | Works, text **and** vision |

The defaults are `ministral-8b-latest` for both, because that is what is verified working. Raise `HALISI_MISTRAL_TEXT_MODEL` and `HALISI_MISTRAL_VISION_MODEL` on a tier that permits it — a larger model follows the dialect style guides noticeably more closely.

Rate limits are a live constraint on lower tiers, so `MistralService` retries `429` and `5xx` with exponential backoff, and video frames are scored sequentially rather than in parallel.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/register`, `/auth/login` | Returns a JWT. |
| `GET` | `/auth/me` | |
| `POST` | `/jobs/text` | **Synchronous.** Returns a finished job. |
| `POST` | `/jobs/document` | Queued. PDF or DOCX, decided by the file. |
| `POST` | `/jobs/image`, `/jobs/video` | Queued. Detection only. |
| `GET` | `/jobs` | Your jobs, newest first. Requires auth. |
| `GET` | `/jobs/:id` | Poll status and progress. |
| `GET` | `/jobs/:id/result` | The full report. |
| `POST` | `/jobs/:id/rewrites` | Generate suggestions. Applies nothing. |
| `POST` | `/jobs/rewrites/:id/decision` | Accept, reject, or return to review. |
| `GET` | `/jobs/:id/media` | The analysed image or video. Bounded preview by default, `?full=1` for the original. |
| `GET` | `/jobs/:id/export` | The finished document — derived, edited and original. |
| `POST` | `/jobs/:id/document/render` | Render the document as TXT, DOCX or PDF. |
| `PUT` | `/jobs/:id/document` | Save the reviewer's own edited version. |
| `DELETE` | `/jobs/:id/document` | Discard edits, revert to the derived version. |
| `GET` | `/health` | Exempt from rate limiting. |

Auth is optional on job creation and reading. An anonymous job is readable by anyone holding its id; a job created by a signed-in user is readable only by that user.

### Why text is synchronous and everything else is not

Pasted text is fast and callers expect an answer in the same request. PDF extraction, OCR and video frame sampling are slow enough that holding an HTTP connection open for them is the wrong shape, so they go through BullMQ and the caller polls.

## How detection works

Four signals are combined by weight, each reporting its own reliability:

| Signal | Weight | What it measures |
|---|---|---|
| Lexical predictability | 0.25 | Stock phrasing, agentless hedging, nominalisation. |
| Burstiness | 0.20 | Variation in sentence length (coefficient of variation). |
| Repetition | 0.15 | Exact recurrence: repeated n-grams, repeated openers, lexical variety. |
| LLM judge | 0.40 | A model assessing phrasing directly, with full context. |
| Style shift | uplift only | Whether the writing changes hand partway through. |

**Style shift is not a member of the weighted ensemble, deliberately.** The other four ask *how generated does this read*; style shift asks *was this written by more than one hand*. Different axes. Averaging it in would **lower** the score for a wholly generated document, which has no internal shift at all — penalising the signal for being consistent. So a detected shift lifts the score and an absent one costs nothing.

It exists because the common real case is not a wholly generated document but a mixed one: someone writes an introduction, pastes in generated body text, then writes a conclusion. Document-level averages hide that. Measured:

| | score | style shift |
|---|---|---|
| Written throughout by one person | 12 (low) | 9 |
| Human opening and close, generated middle | **51 (worth a look)** | **87** |

It compares consecutive paragraphs on sentence length, its variation, lexical variety, word length and punctuation habits. It says nothing about *which* passage is generated, and the report says so.

A signal that reports itself unreliable keeps 35% of its weight rather than being dropped silently, and its unreliability widens the interval.

**On "perplexity".** The file is `heuristics/perplexity.util.ts` for structural fidelity with the design document, but it does **not** compute perplexity. True perplexity needs per-token log-probabilities, and the Mistral API exposes none. It measures the surface features that accompany low-perplexity generated prose instead. It is named for the signal it stands in for, and the API description says so to callers. If Mistral ever exposes logprobs, this is the file to replace.

**Reliability floors are real.** Exact-repeat statistics are noise below ~120 tokens: a 90-word passage can be thoroughly formulaic without repeating a single 4-gram. The repetition signal reports itself unreliable there rather than contributing a confident zero.

### The finished document

`GET /jobs/:id/export` returns three versions, because a reader needs all of them:

- `originalText` — the extracted text, before any rewrite.
- `derivedText` — the original with accepted rewrites spliced in.
- `editedText` — the reviewer's own version, if they saved one. `null` otherwise.
- `text` — whichever should be treated as final. A saved edit always wins, being the most recent human decision.

**One accepted rewrite per span.** Suggestions for the same span are alternatives, not additions — two replacements for identical offsets cannot both be applied. Two rules enforce this:

- `generateForSpans` *replaces* a dialect's suggestions for a span rather than appending, so "Regenerate" cannot leave two live suggestions behind. A unique index on `(jobId, spanId, dialect)` backs this at the database level.
- `decide` returns any sibling accepted rewrite for the same span to "awaiting review" when a new one is accepted, so British and Kenyan versions of one sentence cannot both win.

`applyAccepted` also de-duplicates by span as a last resort, taking the most recent decision. Without these, accepting two rewrites for one span made `applySplices` throw on overlapping ranges and `GET /export` return 500.

Edits are stored in `documents.final_text`, **never over `extracted_text`**. Span offsets index into the extracted text, so overwriting it would silently invalidate every flagged span and every rewrite attached to the job. The round-trip is covered by a check that spans still resolve after an edit.

### Downloading the document

`POST /jobs/:id/document/render` takes `{ text, format }` and returns the file. The text is **sent by the caller** rather than read from storage, so a download is exactly what the reviewer has on screen — unsaved edits included.

DOCX and PDF generation stays server-side: it needs real layout libraries (`docx`, `pdfkit`), and shipping those to the browser for an occasional download is not worth the bundle. More importantly, the server already knows which lines are headings — the same block classifier that keeps the rewriter away from them lays them out as headings in the output, which a `.txt` cannot carry.

CORS exposes `Content-Disposition`. Without that the browser hides the header from JavaScript and every download falls back to a generic filename.

### Span offsets

Every span indexes into `documents.extracted_text` so the UI can highlight in place. Segmentation is lossless by design — sentences carry their trailing whitespace so that slicing a document by span offsets and rejoining reproduces the source. `applySplices` relies on this, and `preserveWhitespaceEnvelope` restores the envelope around a trimmed rewrite so exported documents do not weld sentences together.

## Why rewriting plateaus, and the two scopes

Rewriting has two scopes, because one of them has a hard ceiling.

**`scope: "spans"`** (default) rewrites each flagged sentence on its own. It fixes vocabulary completely — stock phrasing, hedging, promotional adjectives — but it **cannot change burstiness at all**. Sentence-length variation is a property of a passage, and a model shown one sentence has no view of its neighbours. Measured on the same text over three rounds:

| | score | predictability | burstiness | judge |
|---|---|---|---|---|
| Human control | **18** | 0 | **21** | 30 |
| Original | 79 | 100 | 63 | 85 |
| After 1 round | 74 | 92 | 70 | 75 |
| After 2 rounds | 43 | **0** | 62 | 65 |
| After 3 rounds | 44 | 0 | **67** | 65 |

Predictability goes to zero. Burstiness does not move. That is the plateau, and re-running will not break it.

**`scope: "passage"`** rewrites the document paragraph by paragraph, with rhythm as the explicit instruction. The same text: **79 → 36 in a single pass**, burstiness 63 → 32.

It does **not** send the whole document in one call, and the reason is measured. Output length collapses as input grows, because past a few hundred words the instruction "rewrite this" is quietly reinterpreted as "summarise this":

| input | one call (before) | per paragraph (now) |
|---|---|---|
| 243 words | 81% | 108% |
| 477 words | **43%** | 112% |
| 945 words | **26%** | 108% |
| 1,881 words | **6%** | 109% |
| 2,817 words | **6%** | 110% |

A multi-thousand-word document came back as a single title line. Three safeguards now:

- **One block per paragraph** (`chunking.util.ts`), reassembled with the original separators, so structure is preserved by construction rather than by the model complying with an instruction not to merge paragraphs. It does not comply.
- **Headings, labels and field lines are never sent to the model.** `World Setup`, `Submission date: 09/11/2026` and `Jurisdiction and line: Texas.` are returned verbatim. Rewriting a heading into a sentence destroys the document, and that is what a document of headings got.
- **Output under 50% of its input is rejected** — that is a summary, not a rewrite. One retry, then the passage is kept as written. If every passage collapses, nothing is stored and the caller is told to use sentence scope.

That freedom is also the danger. Given the whole passage, a model will compress substance away or invent specifics to make prose vivid — in testing it added figures and rhetorical questions that were never in the source. So every passage rewrite is scored by `fidelity.util.ts`, which measures length drift, introduced content words and — most importantly — **numbers that appear from nowhere**. Concerns lead the rationale the reviewer reads.

A low score reached by fabrication is worse than a high score that is true. The product's whole stance is that the number is a prompt to look, not a target to beat.

## Image detection

Two signals, and the first one matters far more than it looks.

**Generator signatures in the file** (`generator-signatures.util.ts`). Most generators record what made the image, and most pipelines never strip it:

- Stable Diffusion / Automatic1111 write the prompt, sampler, seed, CFG scale and model hash into a PNG `tEXt` chunk.
- ComfyUI embeds its entire node graph.
- DALL·E and Adobe Firefly declare an IPTC `digitalSourceType` of `trainedAlgorithmicMedia` through C2PA.
- Midjourney and others leave a name in EXIF `Software`.

`tEXt`, `zTXt` and `iTXt` chunks are all parsed, compressed ones included. A signature sets a **floor** on the score rather than being averaged in, because the two signals are asymmetric: metadata naming a generator is positive evidence, while a classifier finding no artefacts is an absence — and an absence reported by a general-purpose vision model is weak. Averaging let a file whose EXIF read "Midjourney" score 47.

Measured on the same four test images, before and after:

| | before | after |
|---|---|---|
| Stable Diffusion PNG (params embedded) | 44 | **97** |
| ComfyUI PNG (workflow embedded) | 44 | **97** |
| Midjourney JPEG (EXIF Software) | 44 | **78** |
| Camera JPEG | 22 | **20** |

An earlier version reported a Midjourney tag as *"Explains altered or missing capture metadata **without implying generation**"* — reading a smoking gun as an alibi. There is a regression test for that exact case.

### Video

Video reads container metadata through the same signature scanner — it previously read none at all, which left the strongest available signal on the floor. MP4 and MOV keep provenance in `udta`/`meta` atoms (`©too` encoder, `©cmt` comment) and C2PA `uuid` boxes; WebM keeps it in Matroska `WritingApp`/`MuxingApp`. Sora, Runway, Pika, Kling, Luma, Veo, Synthesia, HeyGen and others write their name into the encoder tag. As with images, a signature sets a **floor** rather than being averaged away.

Weights are container 0.30, frame classifier 0.45, temporal consistency 0.25.

**The visual classifier** is a general Mistral vision model working through an explicit artefact checklist: hands, faces, text, physics, geometry, texture, background coherence, render character. It is weighted below metadata and **is not gated on its self-reported confidence** — small vision models are badly calibrated, and one rated a blank test image "0/100 generated" at 99% confidence.

Images are now sent at 1536px and JPEG quality 94 with 4:4:4 chroma. They were previously downscaled to 1024px at quality 85, which destroyed exactly the fine detail — hair, teeth, lettering, fabric weave — that the model is being asked to inspect.

### What this still cannot do

**A screenshot of an AI image, or one re-encoded through a social platform, carries no metadata.** All that is left is the visual classifier, and a general vision model is materially worse at this than a purpose-trained detector. If image detection matters, the real fix is a trained detector API (Hive, Sightengine, Illuminarty and others); `classifier-client.service.ts` is the single seam to swap it in behind, and the ensemble already treats it as one weighted signal.

Absence of a signature is never evidence of a photograph, and the report says so where it could otherwise be misread.

## Dialect rewriting

Dialect is a prompt-engineering problem, not a rules engine. Spelling could be table-driven; register and idiom cannot, and a find-and-replace pass produces text that is correct and still reads translated. `rewrite/prompts/` holds a style-guide reference per dialect, injected into the rewrite prompt.

The Kenyan English guide treats it as what it is: a standard national variety with settled lexis, idiom and register, taking British spelling as its base. The guide is written to prevent both failure modes — producing plain British English and calling it Kenyan, and producing caricature.

The rewrite prompt asks the model to self-report when it could not preserve meaning; when it does, the warning is promoted into the rationale a reviewer actually reads. **This is a backstop, not a guarantee.** Meaning drift is the real risk in rewriting, and the diff-and-accept flow exists because no prompt eliminates it.

## Layout

```
src/
├── config/           configuration.ts, database.config.ts
├── common/           filters, guards, interceptors, pipes, decorators
├── mistral/          shared LLM client — every model call goes through here
├── auth/ users/      JWT auth
├── jobs/             orchestration, queue, worker, controller
├── ingestion/        extractors: pdf (with OCR fallback), docx
├── detection-text/   heuristics, llm-judge, ensemble scoring
├── rewrite/          dialect prompts, splicing
├── detection-image/  metadata inspection, vision classifier
├── detection-video/  frame extraction, temporal analysis
├── media/            storage boundary (local disk; swap here for S3)
└── database/         migrations
```

`mistral/` is not in the original design document. It exists because the text judge, the rewriter, the image classifier and the video classifier all need the same configured client, and model choice, truncation, JSON handling and failure behaviour should be decided in exactly one place.

## Testing

```bash
pnpm test       # unit — pure logic, no infrastructure needed
pnpm test:e2e   # end-to-end — needs docker compose up and migrations run
```

The unit tests cover what is worth covering: segmentation offsets, the three heuristics, ensemble scoring and interval widening, document splicing, file validation, and model-response parsing. They are the regression net for the parts that fail silently rather than loudly.

Two of them exist because the bug was real. `explainSentence` used `` `\b` `` inside a template literal — which is the **backspace** escape, not a word boundary — so the stock-connective check could never match, and sentences opening with "Furthermore" went unflagged. Model-response parsing is tested against fenced and prose-padded output because JSON mode is not a guarantee in practice.

## Things to know before changing this

- **Entities use `Relation<T>`** for cross-module relations. `emitDecoratorMetadata` emits `design:type` as a direct class reference, which is evaluated at decoration time and hits the temporal dead zone under circular ESM imports. Dropping `Relation<T>` breaks startup with "Cannot access 'Job' before initialization".
- **The global `ValidationPipe` is registered via `APP_PIPE`**, not in `bootstrap()`, so the same validation applies anywhere the app graph is constructed, tests included.
- **Throttlers are named** (`short`, `long`). A bare `@SkipThrottle()` looks for one called `default` and skips nothing.
- **`synchronize` is off everywhere.** Migrations own the schema.
- **Uploads are checked by magic bytes**, not just extension and content type. Both of those are trivially spoofed.
- **Storage keys are resolved through one choke point** that refuses paths escaping the storage root.

## Not implemented

Named honestly rather than stubbed to look finished:

- **Voice-clone detection.** Needs a speaker-verification model. The video report says so explicitly instead of implying an audio check ran.
- **Blink-cadence analysis.** Needs face landmark tracking.
- **C2PA verification.** The marker is detected; the signature is not verified. The report distinguishes "a manifest is attached" from "provenance is proven".
- **S3 storage.** `STORAGE_DRIVER=s3` logs a warning and falls back to local disk. `media.service.ts` is the only file that needs to change.
- **Video frame thumbnails.** Sampled frames are scored and then discarded, so the timeline shows placeholders rather than the frames themselves. Storing them through `media.service.ts` would close this.
- **A purpose-trained image detector.** The design document anticipated one. A general vision model reasons about visible artefacts rather than detecting generator fingerprints, so it is weighted accordingly and its self-reported confidence feeds the interval. Small models calibrate uncertainty poorly — expect confident answers on images with nothing to assess.
