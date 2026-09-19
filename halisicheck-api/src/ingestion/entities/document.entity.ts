import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Job } from '../../jobs/entities/job.entity.js';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  jobId: string;

  @OneToOne(() => Job, (job) => job.document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'jobId' })
  job: Relation<Job>;

  /** Exactly what the caller submitted, before any normalisation. */
  @Column({ type: 'text', nullable: true })
  originalText: string | null;

  /** Plain text after extraction — the string all span offsets refer to. */
  @Column({ type: 'text' })
  extractedText: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceFilename: string | null;

  /** How the text was obtained: 'raw' | 'docx' | 'pdf' | 'pdf-ocr'. */
  @Column({ type: 'varchar', length: 40 })
  extractionMethod: string;

  @Column({ type: 'int' })
  wordCount: number;

  /**
   * The reviewer's own version of the document.
   *
   * Kept separate from `extractedText` so the detector's offsets stay valid
   * and the original is never lost: spans index into `extractedText`, and
   * overwriting it would invalidate every span and rewrite attached to the
   * job. Null means the reader has not edited anything yet.
   */
  @Column({ type: 'text', nullable: true })
  finalText: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalTextUpdatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
