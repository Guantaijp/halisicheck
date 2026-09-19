import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { MediaService } from '../media/media.service.js';
import type {
  FrameScore,
  MediaAsset,
  MediaSignal,
} from '../media/entities/media-asset.entity.js';
import { combineSignals, type SignalInput } from '../detection-text/scoring.util.js';
import { ClassifierClientService } from '../detection-image/classifier-client.service.js';
import {
  extractFrames,
  probeDuration,
  type FfmpegPaths,
} from './frame-extractor.util.js';
import { analyseTemporal } from './temporal-analysis.util.js';
import { inspectContainer } from './container-metadata.util.js';

@Injectable()
export class DetectionVideoService {
  private readonly logger = new Logger(DetectionVideoService.name);
  private readonly videoCfg: AppConfig['video'];
  private readonly thresholds: AppConfig['detection'];

  constructor(
    private readonly media: MediaService,
    private readonly classifier: ClassifierClientService,
    config: ConfigService,
  ) {
    this.videoCfg = config.getOrThrow<AppConfig['video']>('video');
    this.thresholds = config.getOrThrow<AppConfig['detection']>('detection');
  }

  private get paths(): FfmpegPaths {
    return {
      ffmpegPath: this.videoCfg.ffmpegPath,
      ffprobePath: this.videoCfg.ffprobePath,
    };
  }

  /**
   * Samples frames, scores each through the image classifier, then folds in
   * temporal consistency. Frames are scored sequentially rather than in
   * parallel — a 25-frame burst is a reliable way to hit a rate limit, and
   * video is already the slow path.
   */
  async analyse(jobId: string, key: string, mimeType: string): Promise<MediaAsset> {
    const videoPath = this.media.absolutePath(key);

    // Read the container before touching ffmpeg: provenance is the cheapest
    // and strongest signal available, and it is worth having even if frame
    // extraction later fails.
    const container = inspectContainer(await this.media.read(key));

    const duration = await probeDuration(this.paths, videoPath);

    const frames = await extractFrames(this.paths, videoPath, {
      intervalSeconds: this.videoCfg.frameIntervalSeconds,
      maxFrames: this.videoCfg.maxFrames,
      duration,
    });

    const frameScores: FrameScore[] = [];
    let classifierAvailable = false;
    const observations: string[] = [];

    for (const frame of frames) {
      const verdict = await this.classifier.classify(
        frame.buffer,
        `Frame at ${frame.timestamp.toFixed(1)}s of a video clip.`,
      );

      if (verdict.available) {
        classifierAvailable = true;
        if (verdict.score >= this.thresholds.reviewThreshold) {
          observations.push(
            `${frame.timestamp.toFixed(1)}s: ${verdict.observations[0] ?? 'artefacts reported'}`,
          );
        }
      }

      frameScores.push({
        timestamp: frame.timestamp,
        score: verdict.score,
        flagged: verdict.available && verdict.score >= this.thresholds.reviewThreshold,
      });
    }

    const temporal = analyseTemporal(frameScores, this.thresholds.reviewThreshold);
    const flagged = frameScores.filter((f) => f.flagged);

    // The mean over all frames, not over flagged ones — averaging only the
    // flagged frames would make any clip with one bad frame look uniformly bad.
    const meanFrameScore =
      frameScores.length > 0
        ? frameScores.reduce((sum, f) => sum + f.score, 0) / frameScores.length
        : 50;

    const signals: SignalInput[] = [
      {
        id: 'container',
        label: 'Container metadata',
        description:
          'Generator signatures in the video container — encoder tags, writing-app elements and C2PA claims.',
        value: container.score,
        weight: 0.3,
        reliable: true,
      },
      {
        id: 'frames',
        label: 'Frame-level classifier',
        description: 'Mean AI-likelihood across sampled frames.',
        value: Math.round(meanFrameScore),
        weight: 0.45,
        // Not gated on the model's self-reported confidence: small vision
        // models are badly calibrated, so that number would propagate the
        // miscalibration into the interval.
        reliable: classifierAvailable,
      },
      {
        id: 'temporal',
        label: 'Temporal consistency',
        description: 'Sustained runs of suspicious frames, and frame-to-frame volatility.',
        value: temporal.score,
        weight: 0.25,
        reliable: temporal.reliable && classifierAvailable,
      },
    ];

    const ensemble = combineSignals(signals, this.thresholds);

    /**
     * As on the image path, a container that names what generated the clip
     * sets a floor rather than being averaged away by an absence of visible
     * artefacts.
     */
    const floor = container.conclusive
      ? container.score
      : container.signatures.length > 0
        ? 78
        : 0;
    const finalScore = Math.max(ensemble.score, floor);
    const finalMargin = container.conclusive
      ? 3
      : container.signatures.length > 0
        ? Math.min(ensemble.confidenceMargin, 12)
        : ensemble.confidenceMargin;

    const mediaSignals: MediaSignal[] = [
      ...container.signatures.map((signature) => ({
        id: `generator-${signature.source}`,
        label: signature.tool
          ? `Generator signature: ${signature.tool}`
          : 'Generator signature in container metadata',
        detail: signature.detail,
        triggered: true,
        band: (signature.strength === 'suggestive' ? 'medium' : 'high') as MediaSignal['band'],
      })),
      {
        id: 'container',
        label: 'Container metadata',
        detail:
          container.signatures.length > 0
            ? `The container names a generative tool. Encoder tag: "${container.tags.encoder ?? 'none'}".`
            : `No generator signature in the container. Encoder tag: "${container.tags.encoder ?? 'none'}". Absence proves nothing — re-encoding and screen recording strip this.`,
        triggered: container.signatures.length > 0,
        band: container.signatures.length > 0 ? 'high' : 'none',
      },
      {
        id: 'frames',
        label: 'Frame-level classifier',
        detail: classifierAvailable
          ? `${flagged.length} of ${frameScores.length} sampled frames scored above the review threshold.${observations.length > 0 ? ' ' + observations.slice(0, 3).join('; ') : ''}`
          : 'Classifier unavailable — frames could not be scored. This result is inconclusive.',
        triggered: flagged.length > 0,
        band: flagged.length > 0 ? 'high' : 'none',
      },
      {
        id: 'temporal',
        label: 'Temporal consistency',
        detail: temporal.flaggedWindow
          ? `Longest sustained run of flagged frames: ${temporal.longestFlaggedRun} frames, ${temporal.flaggedWindow.start.toFixed(1)}s to ${temporal.flaggedWindow.end.toFixed(1)}s. Mean frame-to-frame change ${temporal.meanFrameDelta}. Compression and cuts can produce the same pattern.`
          : `No sustained run of flagged frames. Mean frame-to-frame change ${temporal.meanFrameDelta}.`,
        triggered: temporal.longestFlaggedRun >= 2,
        band: temporal.longestFlaggedRun >= 2 ? 'medium' : 'none',
      },
      {
        id: 'audio',
        label: 'Voice-clone signal',
        detail:
          'Not implemented. Voice-clone detection needs a speaker-verification model; no audio check contributed to this score.',
        triggered: false,
        band: 'none',
      },
      {
        id: 'blink',
        label: 'Blink cadence',
        detail:
          'Not implemented. Blink-interval analysis needs face landmark tracking, which is not part of this pipeline.',
        triggered: false,
        band: 'none',
      },
    ];

    const buffer = await this.media.read(key);

    const asset = this.media.createAsset({
      jobId,
      filePath: key,
      mimeType,
      sizeBytes: String(buffer.byteLength),
      durationSeconds: duration.toFixed(3),
      frameScores,
      score: finalScore.toFixed(2),
      confidenceMargin: finalMargin.toFixed(2),
      signals: mediaSignals,
      modelUsed: classifierAvailable
        ? 'container metadata + frame sampling + vision classifier + temporal'
        : 'container metadata + frame sampling (classifier unavailable)',
      audioNote:
        'No audio analysis was performed. Any claim about voice cloning would be unfounded.',
    });

    this.logger.log(
      `Job ${jobId}: video scored ${finalScore} +/-${finalMargin} over ${frameScores.length} frames` +
        (container.signatures.length > 0
          ? ` (container names ${container.signatures.map((x) => x.tool ?? x.source).join(', ')})`
          : ''),
    );

    return this.media.saveAsset(asset);
  }
}
