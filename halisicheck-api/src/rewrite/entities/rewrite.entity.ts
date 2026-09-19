import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity.js';
import { DetectionSpan } from '../../detection-text/entities/detection-span.entity.js';

export const DIALECTS = ['british', 'kenyan'] as const;
export type Dialect = (typeof DIALECTS)[number];

@Entity('rewrites')
export class Rewrite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, (job) => job.rewrites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  /** Null when the rewrite covers a whole document rather than one span. */
  @Column({ type: 'uuid', nullable: true })
  spanId: string | null;

  @ManyToOne(() => DetectionSpan, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'spanId' })
  span: Relation<DetectionSpan> | null;

  @Column({ type: 'text' })
  originalText: string;

  @Column({ type: 'text' })
  rewrittenText: string;

  @Column({ type: 'enum', enum: DIALECTS })
  dialect: Dialect;

  /**
   * Nothing is applied silently — a rewrite only counts once a human accepts
   * it here. Null means still awaiting review.
   */
  @Column({ type: 'boolean', nullable: true })
  accepted: boolean | null;

  /** Short plain-language reason this span was rewritten. */
  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'varchar', length: 200 })
  modelUsed: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
