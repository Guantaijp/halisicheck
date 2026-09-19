import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AppConfig } from '../config/configuration.js';
import { DetectionResult } from './entities/detection-result.entity.js';
import { DetectionSpan } from './entities/detection-span.entity.js';
import { LlmJudgeService } from './llm-judge/llm-judge.service.js';
import { analyseBurstiness } from './heuristics/burstiness.util.js';
import { analyseRepetition } from './heuristics/repetition.util.js';
import {
  analysePredictability,
  explainSentence,
} from './heuristics/perplexity.util.js';
import { splitSentences, type Sentence } from './heuristics/segmentation.util.js';
import { analyseStyleShift } from './heuristics/style-shift.util.js';
import { bandForScore, combineSignals, type SignalInput } from './scoring.util.js';

@Injectable()
export class DetectionTextService {
  private readonly logger = new Logger(DetectionTextService.name);
  private readonly thresholds: AppConfig['detection'];

  constructor(
    @InjectRepository(DetectionResult)
    private readonly resultRepo: Repository<DetectionResult>,
    @InjectRepository(DetectionSpan)
    private readonly spanRepo: Repository<DetectionSpan>,
    private readonly judge: LlmJudgeService,
    config: ConfigService,
  ) {
    this.thresholds = config.getOrThrow<AppConfig['detection']>('detection');
  }

  /**
   * Scores a document and persists the result with per-span detail.
   *
   * Produces a likelihood and an interval — never a verdict. Every span the
   * caller sees carries the reasons that put it there, so a reviewer can
   * disagree with the machine on specifics rather than in the abstract.
   */
  async analyse(jobId: string, text: string): Promise<DetectionResult> {
    const sentences = splitSentences(text);

    const burstiness = analyseBurstiness(sentences);
    const repetition = analyseRepetition(text, sentences);
    const predictability = analysePredictability(text);
    const styleShift = analyseStyleShift(text);
    const judgement = await this.judge.judge(text, sentences);

    const signals: SignalInput[] = [
      {
        id: 'predictability',
        label: 'Lexical predictability',
        description:
          'Stock phrasing, agentless hedging and nominalisation. A proxy for perplexity: the Mistral API exposes no token log-probabilities, so this measures the surface features that accompany low-perplexity prose rather than perplexity itself.',
        value: predictability.score,
        weight: 0.25,
        reliable: predictability.reliable,
      },
      {
        id: 'burstiness',
        label: 'Burstiness',
        description:
          'Variation in sentence length. Human writing swings between long and short; generated text evens out.',
        value: burstiness.score,
        weight: 0.2,
        reliable: burstiness.reliable,
      },
      {
        id: 'repetition',
        label: 'Repetition patterns',
        description:
          'Exact recurrence: repeated n-grams, repeated sentence openers and low lexical variety.',
        value: repetition.score,
        weight: 0.15,
        reliable: repetition.reliable,
      },
      {
        id: 'llm-judge',
        label: 'LLM judge',
        description:
          'A model asked to assess phrasing directly, with the whole passage for context.',
        value: judgement.overall,
        weight: 0.4,
        reliable: judgement.available,
      },
    ];

    const ensemble = combineSignals(signals, this.thresholds);

    /**
     * Style shift is deliberately NOT a member of the weighted ensemble.
     *
     * The other four ask "how generated does this read"; this one asks "was
     * this written by more than one hand". They are different axes. Averaging
     * it in would *lower* the score for a wholly generated document, which has
     * no internal shift at all — penalising the signal for being consistent.
     *
     * So a detected shift lifts the score and an absent one costs nothing.
     */
    const shiftUplift = styleShift.boundary
      ? Math.min(12, Math.round(styleShift.score / 6))
      : 0;
    const finalScore = Math.min(100, ensemble.score + shiftUplift);
    const finalBand = bandForScore(finalScore, this.thresholds);

    const result = this.resultRepo.create({
      jobId,
      score: finalScore.toFixed(2),
      confidenceMargin: ensemble.confidenceMargin.toFixed(2),
      verdictLabel: finalBand,
      modelUsed: judgement.available
        ? 'ensemble: heuristics + ' + judgement.modelUsed
        : 'ensemble: heuristics only (judge unavailable)',
      rawOutput: {
        // Reported alongside the weighted signals so a reader sees it, with
        // its own weight shown as the uplift it actually contributed.
        signals: [
          ...ensemble.signals,
          {
            id: 'style-shift',
            label: 'Style consistency',
            description:
              'Whether the writing changes hand partway through. Compares sentence length, vocabulary range and punctuation habits between consecutive paragraphs. A shift suggests a mixed document; its absence is equally consistent with one author and with one generated pass, so it can only ever add to the score.',
            value: styleShift.score,
            weight: 0,
            effectiveWeight: 0,
            reliable: styleShift.reliable,
          },
        ],
        styleShift,
        burstiness,
        repetition,
        predictability,
        judge: {
          available: judgement.available,
          overall: judgement.overall,
          confidence: judgement.confidence,
          summary: judgement.summary,
          truncated: judgement.truncated,
          flaggedSentences: judgement.sentences.length,
        },
        caveat:
          'AI detection is probabilistic. This score is a prompt to look closer, never proof of authorship.',
      },
    });

    const saved = await this.resultRepo.save(result);
    const spans = this.buildSpans(
      saved.id,
      sentences,
      judgement.sentences,
      predictability,
    );

    if (spans.length > 0) await this.spanRepo.save(spans);
    saved.spans = spans;

    this.logger.log(
      `Job ${jobId}: score ${finalScore} +/-${ensemble.confidenceMargin} (${finalBand}), ${spans.length} spans` +
        (styleShift.boundary
          ? ` — style shift at offset ${styleShift.boundary.atOffset}`
          : ''),
    );

    return saved;
  }

  /**
   * Per-sentence scoring. Combines the judge's sentence verdicts with the
   * lexical evidence found locally; a sentence is flagged only if the combined
   * score clears the notice threshold.
   */
  private buildSpans(
    detectionResultId: string,
    sentences: Sentence[],
    judgeVerdicts: { index: number; score: number; reason: string }[],
    predictability: ReturnType<typeof analysePredictability>,
  ): DetectionSpan[] {
    const byIndex = new Map(judgeVerdicts.map((v) => [v.index, v]));
    const spans: DetectionSpan[] = [];

    sentences.forEach((sentence, index) => {
      const verdict = byIndex.get(index);
      const localReasons = explainSentence(sentence.text);

      // Local evidence alone tops out below the review threshold: surface
      // features are suggestive, not sufficient.
      const localScore = Math.min(
        65,
        localReasons.length * 22 + (predictability.score > 60 ? 12 : 0),
      );
      const judgeScore = verdict?.score ?? 0;

      // Take the stronger of the two rather than averaging — averaging lets a
      // silent judge suppress clear lexical evidence, and vice versa.
      const score = Math.max(localScore, judgeScore);
      if (score < this.thresholds.noticeThreshold) return;

      const reasons = [...localReasons];
      if (verdict) reasons.push(`Model judge: ${verdict.reason}`);
      if (reasons.length === 0) {
        reasons.push('Combined signals above notice threshold');
      }

      spans.push(
        this.spanRepo.create({
          detectionResultId,
          startOffset: sentence.start,
          endOffset: sentence.end,
          score: score.toFixed(2),
          band: bandForScore(score, this.thresholds),
          reasons,
          text: sentence.text,
          paragraphIndex: sentence.paragraphIndex,
        }),
      );
    });

    return spans;
  }

  async findByJob(jobId: string): Promise<DetectionResult | null> {
    return this.resultRepo.findOne({
      where: { jobId },
      relations: { spans: true },
      order: { createdAt: 'DESC' },
    });
  }
}
