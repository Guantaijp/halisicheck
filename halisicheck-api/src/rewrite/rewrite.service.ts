import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { MistralService } from '../mistral/mistral.service.js';
import { DetectionSpan } from '../detection-text/entities/detection-span.entity.js';
import { Rewrite, type Dialect } from './entities/rewrite.entity.js';
import { applySplices, preserveWhitespaceEnvelope } from './splice.util.js';
import { assessFidelity, type FidelityReport } from './fidelity.util.js';
import { countParagraphs, reassemble, splitIntoBlocks } from './chunking.util.js';
import { countWords } from '../detection-text/heuristics/segmentation.util.js';
import { passageSystemPrompt } from './prompts/passage.prompt.js';
import { BRITISH_ENGLISH_GUIDE } from './prompts/british-english.prompt.js';
import { KENYAN_ENGLISH_GUIDE } from './prompts/kenyan-english.prompt.js';

const DIALECT_GUIDES: Record<Dialect, string> = {
  british: BRITISH_ENGLISH_GUIDE,
  kenyan: KENYAN_ENGLISH_GUIDE,
};

function systemPrompt(dialect: Dialect): string {
  return `You rewrite prose that reads as AI-generated so that it reads as human-written, in ${dialect === 'british' ? 'British' : 'Kenyan'} English.

${DIALECT_GUIDES[dialect]}

WHAT TO CHANGE
- Break up uniform sentence rhythm. Vary length deliberately; a short sentence after long ones does more than any word swap.
- Cut stock openings and connectives: "In today's rapidly evolving...", "It is important to note", "Furthermore", "Moreover", "Additionally".
- Replace abstract noun stacks with concrete subjects doing things. Name the actor.
- Remove promotional adjectives that carry no information: groundbreaking, revolutionary, unprecedented, seamless, robust.
- Replace agentless hedging with a named source, or cut the claim.

WHAT NOT TO CHANGE
- Never alter the meaning. This is the hard constraint. A rewrite that reads beautifully and says something different is a failure.
- Never invent facts, figures, names, sources or citations. If the original is vague, keep it vague — do not invent specificity to make it concrete.
- Preserve every claim, qualification and hedge the author actually made. If they said "may", do not write "does".
- Keep technical terms, proper nouns and quoted matter exactly as they are.
- Keep roughly the original length. Do not expand or compress substantially.

Respond with ONLY this JSON:
{"rewritten": "<the rewritten text>", "rationale": "<one sentence: what you changed and why>", "meaningPreserved": <true|false>, "notes": "<only if meaningPreserved is false: what you could not preserve>"}`;
}

/** One or more blank lines, built from escapes rather than literal newlines. */
const PARAGRAPH_BREAK = new RegExp('\\n[ \\t]*\\n+', 'g');

interface RewriteResponse {
  rewritten?: unknown;
  rationale?: unknown;
  meaningPreserved?: unknown;
  notes?: unknown;
}

@Injectable()
export class RewriteService {
  private readonly logger = new Logger(RewriteService.name);

  /**
   * Below this, output is a summary rather than a rewrite. Measured: given a
   * whole document, one model returned 81% of the input at 243 words, 43% at
   * 477, and 6% at 1881.
   */
  private static readonly MIN_CHUNK_RATIO = 0.5;

  constructor(
    @InjectRepository(Rewrite)
    private readonly rewriteRepo: Repository<Rewrite>,
    @InjectRepository(DetectionSpan)
    private readonly spanRepo: Repository<DetectionSpan>,
    private readonly mistral: MistralService,
  ) {}

  /**
   * Generates one suggestion per flagged span.
   *
   * Suggestions are stored with `accepted = null`. Nothing is applied to the
   * document here — a human decides per chunk, which is the whole point of the
   * diff-and-accept design.
   */
  async generateForSpans(
    jobId: string,
    spanIds: string[],
    dialect: Dialect,
  ): Promise<Rewrite[]> {
    if (!this.mistral.isConfigured) {
      throw new UnprocessableEntityException(
        'MISTRAL_API_KEY is not set, so rewrites cannot be generated.',
      );
    }

    const spans = await this.spanRepo.find({ where: { id: In(spanIds) } });
    if (spans.length === 0) {
      throw new NotFoundException('No matching spans found for this job.');
    }

    // Regenerating replaces this dialect's suggestions for these spans rather
    // than adding a second set. Appending would leave two live suggestions per
    // span, and accepting both produced overlapping splices that took the
    // whole export down.
    const removed = await this.rewriteRepo.delete({
      jobId,
      dialect,
      spanId: In(spans.map((span) => span.id)),
    });
    if (removed.affected) {
      this.logger.log(
        `Job ${jobId}: replaced ${removed.affected} existing ${dialect} suggestion(s).`,
      );
    }

    const saved: Rewrite[] = [];

    for (const span of spans) {
      const suggestion = await this.rewriteText(span.text, dialect);
      if (suggestion === null) {
        this.logger.warn(`Skipping span ${span.id}: model returned nothing usable.`);
        continue;
      }

      saved.push(
        await this.rewriteRepo.save(
          this.rewriteRepo.create({
            jobId,
            spanId: span.id,
            originalText: span.text,
            rewrittenText: suggestion.rewritten,
            dialect,
            accepted: null,
            rationale: suggestion.rationale,
            modelUsed: this.mistral.textModel,
          }),
        ),
      );
    }

    this.logger.log(`Job ${jobId}: generated ${saved.length} ${dialect} rewrites.`);
    return saved;
  }

  /**
   * Rewrites the whole passage in one call, then stores it as a single
   * document-level suggestion (`spanId = null`).
   *
   * This exists because per-span rewriting cannot move burstiness: sentence
   * length variation is a property of the passage, and a model shown one
   * sentence at a time cannot see its neighbours. Measured on the same text,
   * three per-span rounds moved burstiness 63 -> 67; one passage pass took it
   * to 0, and the overall score from 79 to 29.
   *
   * The result is fidelity-checked before it is stored, because the same
   * freedom that fixes rhythm is what lets a model invent.
   */
  async rewriteWholePassage(
    jobId: string,
    text: string,
    dialect: Dialect,
  ): Promise<Rewrite> {
    if (!this.mistral.isConfigured) {
      throw new UnprocessableEntityException(
        'MISTRAL_API_KEY is not set, so rewrites cannot be generated.',
      );
    }

    const blocks = splitIntoBlocks(text);
    if (blocks.length === 0) {
      throw new UnprocessableEntityException('There is no text to rewrite.');
    }

    const prose = blocks.filter((b) => b.rewritable);
    if (prose.length === 0) {
      throw new UnprocessableEntityException(
        'This document is all headings, labels and field lines — there is no prose to rewrite. Rewriting those would destroy the document, so nothing was changed.',
      );
    }

    const rewritten: (string | null)[] = [];
    let rewrittenCount = 0;
    let keptCount = 0;
    let skippedCount = 0;
    const rhythmNotes: string[] = [];
    let modelReportedAddition: string | null = null;

    for (const block of blocks) {
      if (!block.rewritable) {
        // Headings and fields pass through verbatim.
        rewritten.push(null);
        skippedCount++;
        continue;
      }

      const outcome = await this.rewriteChunk(block.text, dialect);

      if (outcome === null) {
        // Better to leave a passage as the author wrote it than to replace it
        // with a summary of itself.
        rewritten.push(null);
        keptCount++;
        continue;
      }

      rewritten.push(outcome.text);
      rewrittenCount++;
      if (outcome.rhythmNote) rhythmNotes.push(outcome.rhythmNote);
      if (outcome.addedNote && modelReportedAddition === null) {
        modelReportedAddition = outcome.addedNote;
      }
    }

    if (rewrittenCount === 0) {
      throw new UnprocessableEntityException(
        'Every passage came back shorter than half its original length, which is a summary rather than a rewrite. Nothing was stored. Try the sentence-by-sentence scope instead.',
      );
    }

    const result = reassemble(text, blocks, rewritten);
    const fidelity = assessFidelity(text, result);
    const rationale = this.buildPassageRationale(
      {
        rhythmNotes: rhythmNotes[0],
        addedNothing: modelReportedAddition === null,
        notes: modelReportedAddition ?? undefined,
      },
      fidelity,
      false,
      {
        total: blocks.length,
        rewritten: rewrittenCount,
        kept: keptCount,
        skipped: skippedCount,
      },
    );

    // One passage rewrite per job and dialect — regenerating replaces it.
    await this.rewriteRepo.delete({ jobId, dialect, spanId: IsNull() });

    const saved = await this.rewriteRepo.save(
      this.rewriteRepo.create({
        jobId,
        spanId: null,
        originalText: text,
        rewrittenText: result,
        dialect,
        accepted: null,
        rationale,
        modelUsed: this.mistral.textModel,
      }),
    );

    this.logger.log(
      `Job ${jobId}: passage rewrite (${dialect}) over ${blocks.length} block(s) — ${rewrittenCount} rewritten, ${keptCount} kept, ${skippedCount} skipped as headings; length ratio ${fidelity.lengthRatio}.`,
    );

    return saved;
  }

  /**
   * Rewrites one chunk, rejecting output that collapsed into a summary.
   *
   * Length is checked per chunk rather than only on the finished document
   * because that is where the failure happens and where it can still be
   * recovered — one bad chunk falls back to its original instead of taking
   * the whole rewrite down with it.
   */
  private async rewriteChunk(
    chunk: string,
    dialect: Dialect,
    attempt = 0,
  ): Promise<{ text: string; rhythmNote?: string; addedNote?: string } | null> {
    const parsed = await this.mistral.completeJson<{
      rewritten?: unknown;
      rhythmNotes?: unknown;
      addedNothing?: unknown;
      notes?: unknown;
    }>({
      system: passageSystemPrompt(dialect),
      user: `Rewrite this passage. It is one section of a longer document, so rewrite ALL of it and do not summarise:

${chunk}`,
      temperature: 0.4,
      // Room for an output at least as long as the input, or the model has no
      // choice but to truncate.
      maxTokens: Math.min(4000, Math.max(800, Math.ceil(chunk.length / 2))),
    });

    if (parsed === null || typeof parsed.rewritten !== 'string') {
      return attempt === 0 ? this.rewriteChunk(chunk, dialect, 1) : null;
    }

    const text = parsed.rewritten.trim();
    if (text.length === 0) {
      return attempt === 0 ? this.rewriteChunk(chunk, dialect, 1) : null;
    }

    const ratio = countWords(text) / Math.max(1, countWords(chunk));
    if (ratio < RewriteService.MIN_CHUNK_RATIO) {
      this.logger.warn(
        `Chunk rewrite collapsed to ${Math.round(ratio * 100)}% of its length${attempt === 0 ? ' — retrying' : ' — keeping the original'}.`,
      );
      return attempt === 0 ? this.rewriteChunk(chunk, dialect, 1) : null;
    }

    // A block is one paragraph, so any blank line in the output is the model
    // inventing structure. Collapse it rather than reshaping the document.
    const flattened =
      countParagraphs(text) > 1 ? text.replace(PARAGRAPH_BREAK, ' ').trim() : text;

    return {
      text: flattened,
      rhythmNote:
        typeof parsed.rhythmNotes === 'string' ? parsed.rhythmNotes.trim() : undefined,
      addedNote:
        parsed.addedNothing === false && typeof parsed.notes === 'string'
          ? parsed.notes
          : undefined,
    };
  }

  /** Fidelity concerns lead, because they are what a reviewer must not skim. */
  private buildPassageRationale(
    parsed: { rhythmNotes?: unknown; addedNothing?: unknown; notes?: unknown },
    fidelity: FidelityReport,
    truncated: boolean,
    chunks?: { total: number; rewritten: number; kept: number; skipped: number },
  ): string {
    const parts: string[] = [];

    if (chunks) {
      const notes: string[] = [`${chunks.rewritten} passage(s) rewritten`];
      if (chunks.skipped > 0) {
        notes.push(`${chunks.skipped} heading or field line(s) left exactly as they were`);
      }
      if (chunks.kept > 0) {
        notes.push(
          `${chunks.kept} left as written because the rewrite came back as a summary rather than a rewrite`,
        );
      }
      parts.push(notes.join('; ') + '.');
    }

    if (parsed.addedNothing === false) {
      const notes = typeof parsed.notes === 'string' ? parsed.notes : 'unspecified';
      parts.push(`CHECK MEANING — the model reports it added something: ${notes}.`);
    }

    parts.push(...fidelity.warnings);

    if (typeof parsed.rhythmNotes === 'string' && parsed.rhythmNotes.trim()) {
      parts.push(parsed.rhythmNotes.trim());
    } else {
      parts.push('Whole passage rewritten for sentence-length variation.');
    }

    if (truncated) parts.push('(Input was truncated to fit the model context.)');

    return parts.join(' ');
  }

  /** Rewrites an arbitrary passage without persisting it. */
  async rewriteText(
    text: string,
    dialect: Dialect,
  ): Promise<{ rewritten: string; rationale: string } | null> {
    const { text: payload, truncated } = this.mistral.truncate(text);

    const parsed = await this.mistral.completeJson<RewriteResponse>({
      system: systemPrompt(dialect),
      user: `Rewrite this passage:\n\n${payload}`,
      // A little warmth is needed: at temperature 0 the model produces the same
      // uniform rhythm that made the text look generated in the first place.
      temperature: 0.5,
      maxTokens: 1600,
    });

    if (parsed === null || typeof parsed.rewritten !== 'string') return null;

    const rewritten = parsed.rewritten.trim();
    if (rewritten.length === 0) return null;

    let rationale =
      typeof parsed.rationale === 'string' && parsed.rationale.trim().length > 0
        ? parsed.rationale.trim()
        : 'Rewritten for natural rhythm and plainer phrasing.';

    // A self-reported meaning change is the one thing a reviewer must not
    // miss, so it is promoted into the rationale they actually read.
    if (parsed.meaningPreserved === false) {
      const notes = typeof parsed.notes === 'string' ? parsed.notes : 'unspecified';
      rationale = `CHECK MEANING — the model reports it could not fully preserve the original sense: ${notes}. ${rationale}`;
      this.logger.warn(`Rewrite flagged a possible meaning change: ${notes}`);
    }

    if (truncated) {
      rationale = `${rationale} (Input was truncated to fit the model context.)`;
    }

    return { rewritten, rationale };
  }

  async findByJob(jobId: string, dialect?: Dialect): Promise<Rewrite[]> {
    return this.rewriteRepo.find({
      where: dialect ? { jobId, dialect } : { jobId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Records a human decision.
   *
   * Suggestions for the same span are alternatives, not additions — the
   * British and Kenyan rewrites of one sentence cannot both be applied, since
   * they occupy the same offsets. Accepting one therefore returns any sibling
   * to "awaiting review" rather than leaving two winners for one span.
   */
  async decide(id: string, accepted: boolean | null): Promise<Rewrite> {
    const rewrite = await this.rewriteRepo.findOne({ where: { id } });
    if (!rewrite) throw new NotFoundException(`Rewrite ${id} not found.`);

    if (accepted === true && rewrite.spanId !== null) {
      const siblings = await this.rewriteRepo.find({
        where: { jobId: rewrite.jobId, spanId: rewrite.spanId, accepted: true },
      });

      const displaced = siblings.filter((s) => s.id !== rewrite.id);
      if (displaced.length > 0) {
        // Null, not false: the alternative was not rejected on its merits,
        // it simply is not the one chosen.
        await this.rewriteRepo.save(
          displaced.map((s) => Object.assign(s, { accepted: null })),
        );
        this.logger.log(
          `Span ${rewrite.spanId}: returned ${displaced.length} sibling rewrite(s) to review.`,
        );
      }
    }

    rewrite.accepted = accepted;
    return this.rewriteRepo.save(rewrite);
  }

  /** Applies accepted rewrites to the document text. */
  async applyAccepted(jobId: string, originalText: string): Promise<string> {
    const accepted = await this.rewriteRepo.find({
      where: { jobId, accepted: true },
      relations: { span: true },
      order: { updatedAt: 'DESC' },
    });

    // A whole-passage rewrite replaces the document outright, so it cannot be
    // combined with per-span splices — it already contains their text, and
    // its offsets bear no relation to the original. The most recent accepted
    // passage rewrite wins.
    const passage = accepted.find((r) => r.spanId === null);
    if (passage) return passage.rewrittenText;

    // Defensive: one splice per span even if two were somehow accepted for it.
    // Overlapping splices would otherwise throw and take the whole export
    // with them, and existing data may predate the rule enforced in decide().
    const bySpan = new Map<string, (typeof accepted)[number]>();
    for (const rewrite of accepted) {
      if (rewrite.span === null || rewrite.spanId === null) continue;
      const current = bySpan.get(rewrite.spanId);
      // Most recent decision wins.
      if (!current || rewrite.updatedAt > current.updatedAt) {
        bySpan.set(rewrite.spanId, rewrite);
      }
    }

    const splices = [...bySpan.values()]
      .filter((r) => r.span !== null)
      .map((r) => {
        const start = r.span!.startOffset;
        const end = r.span!.endOffset;
        return {
          start,
          end,
          // Spans carry their trailing whitespace; the model's rewrite comes
          // back trimmed. Without restoring the envelope, neighbouring
          // sentences weld together in the exported document.
          text: preserveWhitespaceEnvelope(
            originalText.slice(start, end),
            r.rewrittenText,
          ),
        };
      });

    return applySplices(originalText, splices);
  }
}
