import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity.js';

export interface FrameScore {
  timestamp: number;
  score: number;
  flagged: boolean;
}

export interface MediaSignal {
  id: string;
  label: string;
  detail: string;
  triggered: boolean;
  band: 'low' | 'medium' | 'high' | 'none';
}

@Entity('media_assets')
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => Job, (job) => job.mediaAssets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  /** Storage key — a path under the local root, or an object key for S3. */
  @Column({ type: 'varchar', length: 1000 })
  filePath: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'bigint' })
  sizeBytes: string;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true })
  durationSeconds: string | null;

  /** Per-frame scores for video; empty for stills. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  frameScores: FrameScore[];

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  score: string | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  confidenceMargin: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  signals: MediaSignal[];

  @Column({ type: 'varchar', length: 200, nullable: true })
  modelUsed: string | null;

  @Column({ type: 'text', nullable: true })
  audioNote: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
