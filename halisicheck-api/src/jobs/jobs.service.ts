import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Job, type JobStatus, type JobType } from './entities/job.entity.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import { DetectionTextService } from '../detection-text/detection-text.service.js';
import { DetectionImageService } from '../detection-image/detection-image.service.js';
import { DetectionVideoService } from '../detection-video/detection-video.service.js';
import { MediaService } from '../media/media.service.js';
import { RewriteService } from '../rewrite/rewrite.service.js';
import { bandForScore } from '../detection-text/scoring.util.js';
import type { AppConfig } from '../config/configuration.js';
import { ConfigService } from '@nestjs/config';

export const ANALYSIS_QUEUE = 'analysis';

export interface AnalysisJobData {
  jobId: string;
  type: JobType;
  /** Storage key for media jobs. */
  mediaKey?: string;
  mimeType?: string;
}

/** Per-job summary shown in the history list. */
export interface JobSummary {
  score: number | null;
  confidenceMargin: number | null;
  band: 'low' | 'medium' | 'high' | null;
  flaggedSpans: number;
  wordCount: number | null;
}

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job) private readonly jobRepo: Repository<Job>,
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue<AnalysisJobData>,
    private readonly ingestion: IngestionService,
    private readonly detectionText: DetectionTextService,
    private readonly detectionImage: DetectionImageService,
    private readonly detectionVideo: DetectionVideoService,
    private readonly media: MediaService,
    private readonly rewrite: RewriteService,
    config: ConfigService,
  ) {
    this.thresholds = config.getOrThrow<AppConfig['detection']>('detection');
  }

  private readonly thresholds: AppConfig['detection'];

  /**
   * Pasted text runs inline — it is fast and callers expect an answer in the
   * same request. Everything else is queued: PDF extraction, OCR and video
   * frame sampling are slow enough that holding an HTTP connection open for
   * them is the wrong shape.
   */
  async createTextJob(
    userId: string | null,
    text: string,
    sourceName?: string,
  ): Promise<Job> {
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        userId,
        type: 'text',
        status: 'processing',
        sourceName: sourceName ?? snippet(text),
        startedAt: new Date(),
        progress: 10,
      }),
    );

    try {
      const extracted = await this.ingestion.extract('text', { text });
      await this.ingestion.save(job.id, extracted, { originalText: text });
      await this.detectionText.analyse(job.id, extracted.text);
      return this.markDone(job.id);
    } catch (error) {
      await this.markFailed(job.id, error);
      throw error;
    }
  }

  /** Creates a job for an uploaded file and queues the slow work. */
  async createFileJob(
    userId: string | null,
    type: Exclude<JobType, 'text'>,
    file: UploadedFileLike,
  ): Promise<Job> {
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        userId,
        type,
        status: 'pending',
        sourceName: file.originalname,
        progress: 0,
      }),
    );

    const data: AnalysisJobData = { jobId: job.id, type };

    // Every upload is persisted up front so the worker reads from storage
    // rather than carrying megabytes of payload through Redis.
    data.mediaKey = await this.media.store(job.id, file);
    data.mimeType = file.mimetype;

    await this.queue.add('analyse', data, {
      jobId: job.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(`Queued ${type} job ${job.id} (${file.originalname})`);
    return job;
  }

  /**
   * The worker body. Lives here rather than in the processor so the pipeline
   * can be driven directly in tests without a Redis round-trip.
   */
  async process(data: AnalysisJobData): Promise<void> {
    const { jobId, type, mediaKey, mimeType } = data;
    await this.jobRepo.update(jobId, {
      status: 'processing',
      startedAt: new Date(),
      progress: 15,
    });

    try {
      if (type === 'image' || type === 'video') {
        if (!mediaKey || !mimeType) throw new Error('Media job is missing its stored file.');
        await this.jobRepo.update(jobId, { progress: 40 });

        if (type === 'image') {
          await this.detectionImage.analyse(jobId, mediaKey, mimeType);
        } else {
          await this.detectionVideo.analyse(jobId, mediaKey, mimeType);
        }
      } else {
        if (!mediaKey) throw new Error('Document job is missing its stored file.');
        const buffer = await this.media.read(mediaKey);

        await this.jobRepo.update(jobId, { progress: 35 });
        const extracted = await this.ingestion.extract(type, {
          file: { buffer, originalname: mediaKey },
        });

        await this.ingestion.save(jobId, extracted, { filename: mediaKey });
        await this.jobRepo.update(jobId, { progress: 65 });
        await this.detectionText.analyse(jobId, extracted.text);
      }

      await this.markDone(jobId);
    } catch (error) {
      await this.markFailed(jobId, error);
      throw error;
    }
  }

  async findById(id: string, userId?: string | null): Promise<Job> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Job ${id} not found.`);

    // A job created anonymously stays readable by anyone holding its id; one
    // created by a user is readable only by that user.
    if (job.userId !== null && userId !== job.userId) {
      throw new NotFoundException(`Job ${id} not found.`);
    }

    return job;
  }

  async listForUser(userId: string, limit = 50): Promise<Job[]> {
    return this.jobRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  /**
   * Job list with the summary the history view needs — score, band, flagged
   * span count, word count.
   *
   * Batched into three extra queries rather than one per job: a history page
   * of fifty jobs would otherwise issue two hundred round-trips.
   */
  async listForUserWithSummary(
    userId: string,
    limit = 50,
  ): Promise<(Job & { summary: JobSummary })[]> {
    const jobs = await this.listForUser(userId, limit);
    if (jobs.length === 0) return [];

    const ids = jobs.map((job) => job.id);

    const [textRows, mediaRows, documentRows] = await Promise.all([
      this.jobRepo.manager
        .createQueryBuilder()
        .select('r."jobId"', 'jobId')
        .addSelect('r.score', 'score')
        .addSelect('r."verdictLabel"', 'band')
        .addSelect('r."confidenceMargin"', 'confidenceMargin')
        .addSelect('COUNT(s.id)', 'spanCount')
        .from('detection_results', 'r')
        .leftJoin('detection_spans', 's', 's."detectionResultId" = r.id')
        .where('r."jobId" IN (:...ids)', { ids })
        .groupBy('r."jobId"')
        .addGroupBy('r.score')
        .addGroupBy('r."verdictLabel"')
        .addGroupBy('r."confidenceMargin"')
        .getRawMany<{
          jobId: string;
          score: string;
          band: string;
          confidenceMargin: string;
          spanCount: string;
        }>(),

      this.jobRepo.manager
        .createQueryBuilder()
        .select('a."jobId"', 'jobId')
        .addSelect('a.score', 'score')
        .addSelect('a."confidenceMargin"', 'confidenceMargin')
        .from('media_assets', 'a')
        .where('a."jobId" IN (:...ids)', { ids })
        .getRawMany<{ jobId: string; score: string | null; confidenceMargin: string | null }>(),

      this.jobRepo.manager
        .createQueryBuilder()
        .select('d."jobId"', 'jobId')
        .addSelect('d."wordCount"', 'wordCount')
        .from('documents', 'd')
        .where('d."jobId" IN (:...ids)', { ids })
        .getRawMany<{ jobId: string; wordCount: number }>(),
    ]);

    const text = new Map(textRows.map((row) => [row.jobId, row]));
    const media = new Map(mediaRows.map((row) => [row.jobId, row]));
    const docs = new Map(documentRows.map((row) => [row.jobId, row]));

    return jobs.map((job) => {
      const t = text.get(job.id);
      const m = media.get(job.id);
      const d = docs.get(job.id);

      const score = t?.score ?? m?.score ?? null;
      const margin = t?.confidenceMargin ?? m?.confidenceMargin ?? null;

      return Object.assign(job, {
        summary: {
          score: score === null ? null : Number(score),
          confidenceMargin: margin === null ? null : Number(margin),
          // Media jobs have no detection_results row, so the band is derived
          // from the score with the same thresholds the text path uses.
          band:
            (t?.band as JobSummary['band']) ??
            (score === null
              ? null
              : bandForScore(Number(score), this.thresholds)),
          flaggedSpans: t ? Number(t.spanCount) : 0,
          wordCount: d?.wordCount ?? null,
        },
      });
    });
  }

  /** The full report: document, detection, spans, rewrites or media. */
  async buildResult(job: Job): Promise<Record<string, unknown>> {
    const caveat =
      'AI detection is probabilistic. Every score is a prompt to look closer, never proof of authorship.';

    if (job.type === 'image' || job.type === 'video') {
      const asset = await this.media.findByJob(job.id);
      if (!asset) throw new NotFoundException('No media result for this job yet.');

      return {
        jobId: job.id,
        type: job.type,
        sourceName: job.sourceName,
        analysedAt: job.finishedAt,
        score: asset.score === null ? null : Number(asset.score),
        confidenceMargin:
          asset.confidenceMargin === null ? null : Number(asset.confidenceMargin),
        modelUsed: asset.modelUsed,
        dimensions:
          asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
        durationSeconds:
          asset.durationSeconds === null ? null : Number(asset.durationSeconds),
        frames: asset.frameScores,
        signals: asset.signals,
        audioNote: asset.audioNote,
        rewriteAvailable: false,
        caveat,
      };
    }

    const [document, detection, rewrites] = await Promise.all([
      this.ingestion.findByJob(job.id),
      this.detectionText.findByJob(job.id),
      this.rewrite.findByJob(job.id),
    ]);

    if (!document || !detection) {
      throw new NotFoundException('No detection result for this job yet.');
    }

    return {
      jobId: job.id,
      type: job.type,
      sourceName: job.sourceName,
      analysedAt: job.finishedAt,
      wordCount: document.wordCount,
      extractionMethod: document.extractionMethod,
      extractedText: document.extractedText,
      score: Number(detection.score),
      confidenceMargin: Number(detection.confidenceMargin),
      band: detection.verdictLabel,
      modelUsed: detection.modelUsed,
      signals: (detection.rawOutput as { signals?: unknown }).signals ?? [],
      spans: (detection.spans ?? [])
        .slice()
        .sort((a, b) => a.startOffset - b.startOffset)
        .map((span) => ({
          id: span.id,
          startOffset: span.startOffset,
          endOffset: span.endOffset,
          score: Number(span.score),
          band: span.band,
          reasons: span.reasons,
          text: span.text,
          paragraphIndex: span.paragraphIndex,
        })),
      rewrites: rewrites.map((r) => ({
        id: r.id,
        spanId: r.spanId,
        dialect: r.dialect,
        originalText: r.originalText,
        rewrittenText: r.rewrittenText,
        rationale: r.rationale,
        accepted: r.accepted,
        // Must match the shape POST /jobs/:id/rewrites returns. Omitting it
        // here made a passage rewrite disappear from the UI on refetch.
        scope: r.spanId === null ? 'passage' : 'span',
      })),
      rewriteAvailable: true,
      caveat,
    };
  }

  private async markDone(jobId: string): Promise<Job> {
    await this.jobRepo.update(jobId, {
      status: 'done',
      progress: 100,
      finishedAt: new Date(),
      error: null,
    });
    return this.jobRepo.findOneOrFail({ where: { id: jobId } });
  }

  private async markFailed(jobId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`Job ${jobId} failed: ${message}`);
    await this.jobRepo.update(jobId, {
      status: 'failed',
      finishedAt: new Date(),
      error: message.slice(0, 2000),
    });
  }

  async updateStatus(jobId: string, status: JobStatus): Promise<void> {
    await this.jobRepo.update(jobId, { status });
  }
}

/** Short label for a pasted-text job, shown in history. */
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 80 ? `"${flat}"` : `"${flat.slice(0, 77)}…"`;
}
