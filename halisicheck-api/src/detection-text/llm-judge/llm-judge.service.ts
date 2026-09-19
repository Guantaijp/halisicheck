import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../../mistral/mistral.service.js';
import type { Sentence } from '../heuristics/segmentation.util.js';

export interface JudgeSentenceVerdict {
  index: number;
  /** 0–100 AI-likelihood for this sentence. */
  score: number;
  reason: string;
}

export interface JudgeResult {
  /** 0–100 overall. */
  overall: number;
  /** The judge's own stated confidence, 0–1. Feeds the interval width. */
  confidence: number;
  sentences: JudgeSentenceVerdict[];
  summary: string;
  modelUsed: string;
  /** False when the model was unreachable or unparseable. */
  available: boolean;
  truncated: boolean;
}

const SYSTEM_PROMPT = `You assess whether prose reads as AI-generated. You are one signal in an ensemble, not the decision-maker.

Rules:
- Judge STYLE, not subject matter. Technical, formal or non-native writing is not evidence of generation.
- A confident wrong answer is worse than an honest uncertain one. If a passage is genuinely ambiguous, say so with a mid-range score and low confidence.
- Score per sentence on how AI-generated the PHRASING reads: 0 = unmistakably human, 100 = unmistakably generated.
- Only list sentences scoring 40 or above. Give a specific reason naming what you saw, not a restatement of the score.
- Never claim certainty. You are estimating a likelihood.

Respond with ONLY this JSON:
{"overall": <0-100>, "confidence": <0-1>, "summary": "<one sentence>", "sentences": [{"index": <int>, "score": <0-100>, "reason": "<specific observation>"}]}`;

/**
 * The model-based half of text detection. Deliberately fault-tolerant: if the
 * judge is unavailable the ensemble carries on with its statistical signals
 * and widens the confidence interval, rather than failing the job.
 */
@Injectable()
export class LlmJudgeService {
  private readonly logger = new Logger(LlmJudgeService.name);

  constructor(private readonly mistral: MistralService) {}

  async judge(text: string, sentences: Sentence[]): Promise<JudgeResult> {
    const unavailable = (): JudgeResult => ({
      overall: 50,
      confidence: 0,
      sentences: [],
      summary: 'Model judge unavailable — score derives from statistical signals only.',
      modelUsed: this.mistral.textModel,
      available: false,
      truncated: false,
    });

    if (!this.mistral.isConfigured) {
      this.logger.warn('MISTRAL_API_KEY not set — skipping LLM judge.');
      return unavailable();
    }

    // Numbered sentences let the model address spans without us having to
    // match its paraphrase back to an offset.
    const numbered = sentences
      .map((sentence, index) => `[${index}] ${sentence.text.trim()}`)
      .join('\n');
    const { text: payload, truncated } = this.mistral.truncate(numbered);

    const parsed = await this.mistral.completeJson<{
      overall?: unknown;
      confidence?: unknown;
      summary?: unknown;
      sentences?: unknown;
    }>({
      system: SYSTEM_PROMPT,
      user: `Assess this passage. There are ${sentences.length} numbered sentences.\n\n${payload}`,
      temperature: 0.1,
      maxTokens: 2000,
    });

    if (parsed === null) return unavailable();

    return {
      overall: clampScore(parsed.overall, 50),
      confidence: clamp01(parsed.confidence, 0.5),
      summary:
        typeof parsed.summary === 'string' ? parsed.summary : 'No summary returned.',
      sentences: this.normaliseSentences(parsed.sentences, sentences.length),
      modelUsed: this.mistral.textModel,
      available: true,
      truncated,
    };
  }

  /** Drops anything that does not index a real sentence. */
  private normaliseSentences(raw: unknown, sentenceCount: number): JudgeSentenceVerdict[] {
    if (!Array.isArray(raw)) return [];

    const seen = new Set<number>();
    const out: JudgeSentenceVerdict[] = [];

    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      const index = Number(record.index);

      if (!Number.isInteger(index) || index < 0 || index >= sentenceCount) continue;
      if (seen.has(index)) continue;
      seen.add(index);

      out.push({
        index,
        score: clampScore(record.score, 50),
        reason:
          typeof record.reason === 'string' && record.reason.trim().length > 0
            ? record.reason.trim()
            : 'Flagged by model judge',
      });
    }

    return out;
  }
}

function clampScore(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
