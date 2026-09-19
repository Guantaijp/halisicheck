import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './entities/document.entity.js';
import { DocxExtractor } from './extractors/docx.extractor.js';
import { PdfExtractor, normalise } from './extractors/pdf.extractor.js';
import { countWords } from '../detection-text/heuristics/segmentation.util.js';
import type { JobType } from '../jobs/entities/job.entity.js';

/** Below this, scores are too unstable to be worth reporting. */
const MIN_WORDS_FOR_ANALYSIS = 20;

export interface ExtractedDocument {
  text: string;
  method: string;
  wordCount: number;
  warnings: string[];
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    private readonly pdf: PdfExtractor,
    private readonly docx: DocxExtractor,
  ) {}

  /** Routes a payload to the right extractor and validates what came back. */
  async extract(
    type: JobType,
    payload: { text?: string; file?: { buffer: Buffer; originalname: string } },
  ): Promise<ExtractedDocument> {
    let outcome: { text: string; method: string; warnings: string[] };

    switch (type) {
      case 'text': {
        if (!payload.text) throw new BadRequestException('No text supplied.');
        outcome = { text: normalise(payload.text), method: 'raw', warnings: [] };
        break;
      }
      case 'pdf': {
        const file = this.requireFile(payload.file);
        const result = await this.pdf.extract(file.buffer);
        outcome = { text: result.text, method: result.method, warnings: result.warnings };
        break;
      }
      case 'docx': {
        const file = this.requireFile(payload.file);
        const result = await this.docx.extract(file.buffer);
        outcome = { text: result.text, method: result.method, warnings: result.warnings };
        break;
      }
      default:
        throw new BadRequestException(
          `Type "${type}" is not a text-bearing job and has no extraction step.`,
        );
    }

    const wordCount = countWords(outcome.text);

    if (wordCount === 0) {
      throw new UnprocessableEntityException(
        'No readable text could be extracted from this file.',
      );
    }

    const warnings = [...outcome.warnings];
    if (wordCount < MIN_WORDS_FOR_ANALYSIS) {
      // Not an error: the caller may still want the result, but it must not be
      // presented as though it carried the same weight as a full document.
      warnings.push(
        `Only ${wordCount} words were extracted. Detection is unreliable below about ${MIN_WORDS_FOR_ANALYSIS} words; treat this score as indicative at best.`,
      );
    }

    return { text: outcome.text, method: outcome.method, wordCount, warnings };
  }

  async save(
    jobId: string,
    extracted: ExtractedDocument,
    source: { originalText?: string; filename?: string },
  ): Promise<Document> {
    const document = this.documentRepo.create({
      jobId,
      originalText: source.originalText ?? null,
      extractedText: extracted.text,
      sourceFilename: source.filename ?? null,
      extractionMethod: extracted.method,
      wordCount: extracted.wordCount,
    });

    this.logger.log(
      `Job ${jobId}: extracted ${extracted.wordCount} words via ${extracted.method}`,
    );

    return this.documentRepo.save(document);
  }

  async findByJob(jobId: string): Promise<Document | null> {
    return this.documentRepo.findOne({ where: { jobId } });
  }

  /**
   * Stores the reviewer's own version of the document.
   *
   * `extractedText` is deliberately left untouched: span offsets index into
   * it, so overwriting it would silently invalidate every flagged span and
   * every rewrite attached to the job.
   */
  async saveFinalText(jobId: string, text: string): Promise<Document> {
    const document = await this.documentRepo.findOne({ where: { jobId } });
    if (!document) {
      throw new NotFoundException(`No document for job ${jobId}.`);
    }

    document.finalText = text;
    document.finalTextUpdatedAt = new Date();
    return this.documentRepo.save(document);
  }

  /** Discards manual edits so the document reverts to the derived version. */
  async clearFinalText(jobId: string): Promise<Document> {
    const document = await this.documentRepo.findOne({ where: { jobId } });
    if (!document) {
      throw new NotFoundException(`No document for job ${jobId}.`);
    }

    document.finalText = null;
    document.finalTextUpdatedAt = null;
    return this.documentRepo.save(document);
  }

  private requireFile<T>(file: T | undefined): T {
    if (!file) throw new BadRequestException('A file upload is required for this job type.');
    return file;
  }
}
