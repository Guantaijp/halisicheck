import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job as BullJob } from 'bullmq';
import { ANALYSIS_QUEUE, JobsService, type AnalysisJobData } from './jobs.service.js';

/**
 * BullMQ worker for the slow path.
 *
 * Concurrency is deliberately low: every job here makes several LLM calls, and
 * a video job makes one per sampled frame. Running many at once is the fastest
 * route to a rate limit, and the queue already smooths the load.
 */
@Processor(ANALYSIS_QUEUE, { concurrency: 2 })
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly jobs: JobsService) {
    super();
  }

  async process(job: BullJob<AnalysisJobData>): Promise<void> {
    this.logger.log(
      `Processing ${job.data.type} job ${job.data.jobId} (attempt ${job.attemptsMade + 1})`,
    );
    await this.jobs.process(job.data);
  }
}
