import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { OcrExtractor } from './ocr.extractor.js';

export interface ExtractionOutcome {
  text: string;
  /** 'pdf' for the embedded text layer, 'pdf-ocr' when OCR was needed. */
  method: string;
  pageCount: number;
  warnings: string[];
}

/**
 * Characters of extracted text per page below which a PDF is treated as
 * scanned. A text-layer PDF comfortably clears this; a page of scanned images
 * yields almost nothing.
 */
const MIN_CHARS_PER_PAGE = 80;

@Injectable()
export class PdfExtractor {
  private readonly logger = new Logger(PdfExtractor.name);

  constructor(private readonly ocr: OcrExtractor) {}

  /**
   * Extracts text from a PDF, falling back to OCR when the document has no
   * usable text layer. The fallback is reported in `method` so a reader can
   * tell transcription from extraction — OCR output is materially noisier and
   * should not be scored as though it were clean text.
   */
  async extract(buffer: Buffer): Promise<ExtractionOutcome> {
    const warnings: string[] = [];
    let parser: PDFParse | null = null;

    try {
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const text = normalise(result.text ?? '');
      const pageCount = result.total ?? result.pages?.length ?? 0;

      const hasUsableTextLayer =
        pageCount > 0 && text.length >= MIN_CHARS_PER_PAGE * Math.min(pageCount, 3);

      if (hasUsableTextLayer) {
        return { text, method: 'pdf', pageCount, warnings };
      }

      this.logger.log(
        `PDF has little or no text layer (${text.length} chars over ${pageCount} pages) — falling back to OCR.`,
      );
      warnings.push(
        'No usable text layer found; text was recovered by OCR and may contain transcription errors.',
      );

      const ocrText = await this.ocrPages(parser, warnings);
      return {
        // Prefer whichever recovered more; a partial text layer can still beat
        // a failed OCR pass.
        text: ocrText.length > text.length ? ocrText : text,
        method: ocrText.length > text.length ? 'pdf-ocr' : 'pdf',
        pageCount,
        warnings,
      };
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  private async ocrPages(parser: PDFParse, warnings: string[]): Promise<string> {
    try {
      const shots = await parser.getScreenshot({ scale: 2 });
      if (shots.pages.length === 0) return '';

      const pages: string[] = [];
      for (const page of shots.pages) {
        pages.push(await this.ocr.recognise(Buffer.from(page.data)));
      }
      return normalise(pages.join('\n\n'));
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`OCR fallback failed: ${message}`);
      warnings.push(`OCR fallback failed: ${message}`);
      return '';
    }
  }
}

/** Collapses the ragged whitespace PDF extraction tends to produce. */
export function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
