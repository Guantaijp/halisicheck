import {
  scanForGeneratorSignatures,
  scoreSignatures,
  type GeneratorSignature,
} from '../detection-image/generator-signatures.util.js';

export interface ContainerFindings {
  signatures: GeneratorSignature[];
  /** 0–100 from provenance alone. */
  score: number;
  conclusive: boolean;
  /** Encoder / handler strings found in the container, for the audit trail. */
  tags: Record<string, string>;
}

/**
 * Reads provenance out of a video container.
 *
 * Video was doing no metadata inspection whatsoever, which left the single
 * cheapest and strongest signal on the floor — the same one that took image
 * detection from 44 to 97 on files that declare themselves.
 *
 * MP4 and MOV keep this in `udta`/`meta` atoms (`©too` for the encoder,
 * `©cmt` for comments, plus any XMP packet); WebM keeps it in the Matroska
 * `WritingApp` and `MuxingApp` elements. Rather than implement two container
 * parsers, this extracts the printable strings from the head and tail of the
 * file and hands them to the same signature scanner the image path uses.
 *
 * Generators including Sora, Runway, Pika, Kling and Luma write their name
 * into the encoder tag, and C2PA manifests appear in MP4 `uuid` boxes.
 */

/** Atom and element names whose values are worth reporting. */
const TAG_PATTERNS: { key: string; pattern: RegExp }[] = [
  { key: 'encoder', pattern: /©too([\x20-\x7e]{2,80})/ },
  { key: 'comment', pattern: /©cmt([\x20-\x7e]{2,120})/ },
  { key: 'title', pattern: /©nam([\x20-\x7e]{2,80})/ },
  { key: 'artist', pattern: /©ART([\x20-\x7e]{2,80})/ },
  { key: 'handler', pattern: /hdlr[\s\S]{0,24}?([\x20-\x7e]{4,60})/ },
  { key: 'writingApp', pattern: /WritingApp[\s\S]{0,4}([\x20-\x7e]{2,80})/i },
  { key: 'muxingApp', pattern: /MuxingApp[\s\S]{0,4}([\x20-\x7e]{2,80})/i },
];

/**
 * Container metadata clusters at the very start or the very end, so reading
 * both ends catches it without loading a multi-gigabyte file into memory.
 */
const WINDOW = 512 * 1024;

export function inspectContainer(buffer: Buffer): ContainerFindings {
  const head = buffer.subarray(0, Math.min(buffer.length, WINDOW));
  const tail =
    buffer.length > WINDOW
      ? buffer.subarray(Math.max(0, buffer.length - WINDOW))
      : Buffer.alloc(0);

  const window = Buffer.concat([head, tail]).toString('latin1');

  const tags: Record<string, string> = {};
  for (const { key, pattern } of TAG_PATTERNS) {
    const match = window.match(pattern);
    if (match?.[1]) {
      const value = match[1].replace(/[^\x20-\x7e]/g, '').trim();
      if (value.length >= 2) tags[key] = value.slice(0, 120);
    }
  }

  // Feed both the raw window and the extracted tags to the shared scanner:
  // the tags give it clean values, the window catches XMP and C2PA claims.
  const signatures = scanForGeneratorSignatures(
    Buffer.from(window, 'latin1'),
    tags as unknown as Record<string, unknown>,
  );

  return {
    signatures,
    score: scoreSignatures(signatures),
    conclusive: signatures.some((s) => s.strength === 'conclusive'),
    tags,
  };
}
