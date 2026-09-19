import { Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const logger = new Logger('FrameExtractor');

export interface ExtractedFrame {
  timestamp: number;
  buffer: Buffer;
}

export interface FfmpegPaths {
  ffmpegPath: string;
  ffprobePath: string;
}

export class FfmpegUnavailableError extends Error {
  constructor(binary: string, cause: string) {
    super(
      `${binary} could not be run (${cause}). Install ffmpeg and put it on PATH, or set HALISI_FFMPEG_PATH / HALISI_FFPROBE_PATH.`,
    );
    this.name = 'FfmpegUnavailableError';
  }
}

/** Runs a binary to completion, capturing both streams. */
function run(
  binary: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      reject(new FfmpegUnavailableError(binary, (error as NodeJS.ErrnoException).code ?? error.message));
    });
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function probeDuration(
  paths: FfmpegPaths,
  videoPath: string,
): Promise<number> {
  const { code, stdout, stderr } = await run(paths.ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);

  if (code !== 0) {
    throw new Error(`ffprobe failed (exit ${code}): ${stderr.trim().slice(0, 300)}`);
  }

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned no usable duration for this file.`);
  }
  return duration;
}

/**
 * Samples frames at a fixed interval.
 *
 * Frames are written to a temp directory rather than piped, so a malformed
 * stream fails at extraction instead of halfway through scoring, and the
 * directory is always cleaned up.
 */
export async function extractFrames(
  paths: FfmpegPaths,
  videoPath: string,
  options: { intervalSeconds: number; maxFrames: number; duration: number },
): Promise<ExtractedFrame[]> {
  const { intervalSeconds, maxFrames, duration } = options;

  // Stretch the interval rather than truncate the clip: sampling only the
  // first N seconds of a long video would silently miss everything after.
  const plannedCount = Math.floor(duration / intervalSeconds) + 1;
  const effectiveInterval =
    plannedCount > maxFrames ? duration / (maxFrames - 1 || 1) : intervalSeconds;

  const dir = await mkdtemp(join(tmpdir(), 'halisi-frames-'));

  try {
    const { code, stderr } = await run(paths.ffmpegPath, [
      '-v', 'error',
      '-i', videoPath,
      '-vf', `fps=1/${effectiveInterval.toFixed(4)},scale=640:-2`,
      '-frames:v', String(maxFrames),
      '-q:v', '3',
      join(dir, 'frame-%04d.jpg'),
    ]);

    if (code !== 0) {
      throw new Error(`ffmpeg frame extraction failed (exit ${code}): ${stderr.trim().slice(0, 300)}`);
    }

    const files = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort();
    const frames: ExtractedFrame[] = [];

    for (const [index, file] of files.entries()) {
      frames.push({
        // ffmpeg's fps filter emits the first frame at t=0.
        timestamp: Math.round(index * effectiveInterval * 100) / 100,
        buffer: await readFile(join(dir, file)),
      });
    }

    logger.log(
      `Extracted ${frames.length} frames every ${effectiveInterval.toFixed(2)}s from a ${duration.toFixed(1)}s clip.`,
    );
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
