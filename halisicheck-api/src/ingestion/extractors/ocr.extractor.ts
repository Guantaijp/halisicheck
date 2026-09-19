import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createWorker, type Worker } from 'tesseract.js';

/**
 * OCR fallback for scanned pages.
 *
 * The worker is expensive to create (it downloads and caches a language model
 * on first use), so one is created lazily and reused. Creation is guarded by a
 * shared promise so concurrent jobs cannot race into building several.
 */
@Injectable()
export class OcrExtractor implements OnModuleDestroy {
  private readonly logger = new Logger(OcrExtractor.name);
  private workerPromise: Promise<Worker> | null = null;

  private async getWorker(): Promise<Worker> {
    this.workerPromise ??= (async () => {
      this.logger.log('Initialising Tesseract worker (first run downloads language data)…');
      return createWorker('eng');
    })().catch((error: unknown) => {
      // Reset so a transient failure does not poison every later request.
      this.workerPromise = null;
      throw error;
    });

    return this.workerPromise;
  }

  async recognise(image: Buffer): Promise<string> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(image);
    return data.text ?? '';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.workerPromise === null) return;
    try {
      const worker = await this.workerPromise;
      await worker.terminate();
    } catch {
      // Shutdown is best-effort; a failed terminate must not block exit.
    }
  }
}
