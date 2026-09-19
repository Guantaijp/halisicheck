import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { MediaService } from '../media/media.service.js';
import type { MediaAsset, MediaSignal } from '../media/entities/media-asset.entity.js';
import { combineSignals, type SignalInput } from '../detection-text/scoring.util.js';
import { ClassifierClientService } from './classifier-client.service.js';
import { inspectImage } from './metadata.util.js';

@Injectable()
export class DetectionImageService {
  private readonly logger = new Logger(DetectionImageService.name);
  private readonly thresholds: AppConfig['detection'];

  constructor(
    private readonly media: MediaService,
    private readonly classifier: ClassifierClientService,
    config: ConfigService,
  ) {
    this.thresholds = config.getOrThrow<AppConfig['detection']>('detection');
  }

  /**
   * Detection only — there is no rewrite path for media, by design.
   *
   * Metadata and the classifier are weighted very unevenly on purpose:
   * stripped EXIF is ordinary and proves little, whereas visible rendering
   * artefacts are the only thing that should be able to flag an image.
   */
  async analyse(jobId: string, key: string, mimeType: string): Promise<MediaAsset> {
    const buffer = await this.media.read(key);
    const metadata = await inspectImage(buffer);
    const verdict = await this.classifier.classify(buffer);

    const signals: SignalInput[] = [
      {
        id: 'metadata',
        label: 'File metadata',
        description:
          'Generator signatures left in the file, EXIF, C2PA content credentials and output dimensions.',
        value: metadata.score,
        // Weighted above the classifier: metadata evidence is checkable, and
        // the classifier is a general vision model rather than a trained
        // detector.
        weight: 0.55,
        reliable: true,
      },
      {
        id: 'classifier',
        label: 'Image classifier',
        description: 'A vision model assessing rendering artefacts.',
        value: verdict.score,
        weight: 0.45,
        // Deliberately NOT gated on the model's self-reported confidence.
        // Small vision models are badly calibrated — one rated a blank test
        // image "0/100 generated" at 99% confidence — so using that number as
        // a reliability gate propagates the miscalibration into the interval.
        reliable: verdict.available,
      },
    ];

    const ensemble = combineSignals(signals, this.thresholds);

    /**
     * A generator signature sets a FLOOR, it does not just get averaged in.
     *
     * Averaging is wrong here because the two signals are not symmetric.
     * Metadata naming a generator is positive evidence; the classifier finding
     * no visual artefacts is an absence, and an absence from a general-purpose
     * vision model is weak. Letting the second cancel the first put a file
     * whose EXIF read "Midjourney" at 47 out of 100.
     *
     * The classifier can still push the score UP past the floor.
     */
    const strongest = metadata.signatures.reduce<'conclusive' | 'strong' | 'suggestive' | null>(
      (best, s) => {
        if (s.strength === 'conclusive') return 'conclusive';
        if (s.strength === 'strong' && best !== 'conclusive') return 'strong';
        if (s.strength === 'suggestive' && best === null) return 'suggestive';
        return best;
      },
      null,
    );

    const floor =
      strongest === 'conclusive'
        ? metadata.score
        : strongest === 'strong'
          ? 78
          : 0;

    const finalScore = Math.max(ensemble.score, floor);
    const finalMargin = metadata.conclusive
      ? 3
      : strongest === 'strong'
        ? Math.min(ensemble.confidenceMargin, 12)
        : ensemble.confidenceMargin;

    const allSignals: MediaSignal[] = [...metadata.signals];

    if (strongest === 'conclusive' || strongest === 'strong') {
      // Said plainly, because it changes what the reader should do next.
      allSignals.unshift({
        id: 'provenance',
        label:
          strongest === 'conclusive'
            ? 'The file records its own origin'
            : 'The file names a generator in its metadata',
        detail:
          metadata.conclusive
            ? 'This image carries metadata written by the tool that generated it — generation parameters, a workflow graph or a declared synthetic-media type. That is far stronger than any visual assessment, and the score reflects it. The converse does not hold: an image with no such metadata is not thereby a photograph, because screenshots and re-encodes strip it.'
            : "A generative tool is named in this image's metadata. Weaker than embedded generation parameters, and metadata can be edited, but it is positive evidence and the score will not fall below it on the classifier's say-so.",
        triggered: true,
        band: 'high',
      });
    }

    allSignals.push({
      id: 'classifier',
      label: 'Image classifier',
      detail: verdict.available
        ? `Model reports ${verdict.score}/100 generated at ${Math.round(verdict.confidence * 100)}% confidence. ${verdict.observations.join(' ') || 'No specific artefacts cited.'}`
        : 'Classifier unavailable — score derives from metadata alone, which is weak evidence. Treat this result as inconclusive.',
      triggered: verdict.available && verdict.score >= this.thresholds.noticeThreshold,
      band: verdict.available
        ? bandOf(verdict.score, this.thresholds)
        : 'none',
    });

    const asset = this.media.createAsset({
      jobId,
      filePath: key,
      mimeType,
      sizeBytes: String(buffer.byteLength),
      width: metadata.width,
      height: metadata.height,
      score: finalScore.toFixed(2),
      confidenceMargin: finalMargin.toFixed(2),
      signals: allSignals,
      frameScores: [],
      modelUsed: verdict.available
        ? `metadata + ${verdict.modelUsed}`
        : 'metadata only (classifier unavailable)',
    });

    this.logger.log(
      `Job ${jobId}: image scored ${finalScore} +/-${finalMargin}` +
        (metadata.conclusive
          ? ` (conclusive generator signature: ${metadata.signatures.map((x) => x.tool ?? x.source).join(', ')})`
          : ''),
    );

    return this.media.saveAsset(asset);
  }
}

function bandOf(
  score: number,
  thresholds: { noticeThreshold: number; reviewThreshold: number },
): 'low' | 'medium' | 'high' {
  if (score >= thresholds.reviewThreshold) return 'high';
  if (score >= thresholds.noticeThreshold) return 'medium';
  return 'low';
}
