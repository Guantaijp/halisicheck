import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { normalise, type ExtractionOutcome } from './pdf.extractor.js';

@Injectable()
export class DocxExtractor {
  private readonly logger = new Logger(DocxExtractor.name);

  /**
   * DOCX to plain text. Mammoth's messages carry genuine fidelity warnings
   * (dropped images, unsupported styles), so they are surfaced rather than
   * swallowed — they explain gaps a reviewer would otherwise puzzle over.
   */
  async extract(buffer: Buffer): Promise<ExtractionOutcome> {
    const result = await mammoth.extractRawText({ buffer });
    const warnings = result.messages
      .filter((message) => message.type === 'warning' || message.type === 'error')
      .map((message) => message.message)
      .slice(0, 10);

    if (warnings.length > 0) {
      this.logger.warn(`DOCX extraction produced ${warnings.length} warning(s).`);
    }

    return {
      text: normalise(result.value ?? ''),
      method: 'docx',
      pageCount: 0,
      warnings,
    };
  }
}
