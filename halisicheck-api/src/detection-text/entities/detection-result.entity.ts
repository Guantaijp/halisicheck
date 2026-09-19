import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity.js';
import { DetectionSpan } from './detection-span.entity.js';

/**
 * Bands, never verdicts. `verdictLabel` is deliberately a review instruction
 * rather than a claim about authorship.
 */
export const VERDICT_LABELS = ['low', 'medium', 'high'] as const;
export type VerdictLabel = (typeof VERDICT_LABELS)[number];

@Entity('detection_results')
export class DetectionResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, (job) => job.detectionResults, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  /** Overall AI-likelihood, 0–100. */
  @Column({ type: 'numeric', precision: 5, scale: 2 })
  score: string;

  /**
   * Half-width of the confidence interval in points. Stored alongside the
   * score so no consumer can render a bare number as a certainty.
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 10 })
  confidenceMargin: string;

  @Column({ type: 'enum', enum: VERDICT_LABELS })
  verdictLabel: VerdictLabel;

  @Column({ type: 'varchar', length: 200 })
  modelUsed: string;

  /** Full signal breakdown and the raw judge response, for auditability. */
  @Column({ type: 'jsonb' })
  rawOutput: Record<string, unknown>;

  @OneToMany(() => DetectionSpan, (span) => span.detectionResult, { cascade: true })
  spans: Relation<DetectionSpan[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
