import type { FrameScore } from '../media/entities/media-asset.entity.js';

export interface TemporalFindings {
  /** 0–100. Higher = less temporally consistent = more suspicious. */
  score: number;
  /** Mean absolute change in score between consecutive frames. */
  meanFrameDelta: number;
  /** Longest unbroken run of frames over the review threshold. */
  longestFlaggedRun: number;
  /** Start and end of that run, in seconds. */
  flaggedWindow: { start: number; end: number } | null;
  reliable: boolean;
}

const MIN_FRAMES = 5;

/**
 * Temporal consistency across sampled frames.
 *
 * A *sustained* run of suspicious frames means considerably more than the same
 * number scattered at random: isolated spikes are usually motion blur, a cut,
 * or a compression artefact. So a contiguous run is what drives the score,
 * and frame-to-frame volatility only nudges it.
 */
export function analyseTemporal(
  frames: FrameScore[],
  reviewThreshold: number,
): TemporalFindings {
  if (frames.length < 2) {
    return {
      score: 50,
      meanFrameDelta: 0,
      longestFlaggedRun: 0,
      flaggedWindow: null,
      reliable: false,
    };
  }

  const ordered = [...frames].sort((a, b) => a.timestamp - b.timestamp);

  let deltaSum = 0;
  for (let i = 1; i < ordered.length; i++) {
    deltaSum += Math.abs(ordered[i].score - ordered[i - 1].score);
  }
  const meanFrameDelta = deltaSum / (ordered.length - 1);

  let longestRun = 0;
  let currentRun = 0;
  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;

  for (const frame of ordered) {
    if (frame.score >= reviewThreshold) {
      if (currentRun === 0) currentStart = frame.timestamp;
      currentRun++;
      if (currentRun > longestRun) {
        longestRun = currentRun;
        bestStart = currentStart;
        bestEnd = frame.timestamp;
      }
    } else {
      currentRun = 0;
    }
  }

  const runShare = longestRun / ordered.length;

  // A sustained run dominates; volatility contributes a little on top. Both
  // are capped so this signal can never be the sole reason a clip is flagged.
  const score = Math.round(
    Math.min(100, runShare * 85 + Math.min(meanFrameDelta, 40) * 0.35),
  );

  return {
    score,
    meanFrameDelta: Math.round(meanFrameDelta * 100) / 100,
    longestFlaggedRun: longestRun,
    flaggedWindow: longestRun > 0 ? { start: bestStart, end: bestEnd } : null,
    reliable: ordered.length >= MIN_FRAMES,
  };
}
