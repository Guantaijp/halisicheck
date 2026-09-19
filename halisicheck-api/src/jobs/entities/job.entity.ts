import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Document } from '../../ingestion/entities/document.entity.js';
import { DetectionResult } from '../../detection-text/entities/detection-result.entity.js';
import { Rewrite } from '../../rewrite/entities/rewrite.entity.js';
import { MediaAsset } from '../../media/entities/media-asset.entity.js';

export const JOB_TYPES = ['text', 'docx', 'pdf', 'image', 'video'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, (user) => user.jobs, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: Relation<User> | null;

  @Column({ type: 'enum', enum: JOB_TYPES })
  type: JobType;

  @Index()
  @Column({ type: 'enum', enum: JOB_STATUSES, default: 'pending' })
  status: JobStatus;

  /** Filename, or a short snippet for pasted text. Shown in history. */
  @Column({ type: 'varchar', length: 500 })
  sourceName: string;

  /** Populated only when status is 'failed'. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Coarse progress for the polling endpoint, 0–100. */
  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @OneToOne(() => Document, (doc) => doc.job)
  document: Relation<Document> | null;

  @OneToMany(() => DetectionResult, (result) => result.job)
  detectionResults: Relation<DetectionResult[]>;

  @OneToMany(() => Rewrite, (rewrite) => rewrite.job)
  rewrites: Relation<Rewrite[]>;

  @OneToMany(() => MediaAsset, (asset) => asset.job)
  mediaAssets: Relation<MediaAsset[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
