import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { DetectionResult, type VerdictLabel } from './detection-result.entity.js';

/**
 * One scored run of text. Offsets index into documents.extracted_text, so the
 * UI can highlight in place rather than re-deriving positions.
 */
@Entity('detection_spans')
export class DetectionSpan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  detectionResultId: string;

  @ManyToOne(() => DetectionResult, (result) => result.spans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'detectionResultId' })
  detectionResult: Relation<DetectionResult>;

  @Column({ type: 'int' })
  startOffset: number;

  @Column({ type: 'int' })
  endOffset: number;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  score: string;

  @Column({ type: 'varchar', length: 10 })
  band: VerdictLabel;

  /** Which signals fired on this span, in plain language. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  reasons: string[];

  /** Denormalised copy of the span text — avoids a substring round-trip. */
  @Column({ type: 'text' })
  text: string;

  /** Index of the containing paragraph, for grouping in the UI. */
  @Column({ type: 'int', default: 0 })
  paragraphIndex: number;
}
