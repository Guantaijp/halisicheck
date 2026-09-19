import exifr from 'exifr';
import sharp from 'sharp';
import type { MediaSignal } from '../media/entities/media-asset.entity.js';
import {
  scanForGeneratorSignatures,
  scoreSignatures,
  type GeneratorSignature,
} from './generator-signatures.util.js';

export interface MetadataFindings {
  signals: MediaSignal[];
  /** 0–100 derived from metadata alone. */
  score: number;
  width: number | null;
  height: number | null;
  /** Provenance the generator left in the file, if any. */
  signatures: GeneratorSignature[];
  /**
   * True when the file states its own provenance. The classifier's opinion
   * cannot outweigh the file saying what made it.
   */
  conclusive: boolean;
  /** Raw values kept for the audit trail. */
  details: Record<string, unknown>;
}

/**
 * Output sizes that image generators default to. Weak on its own — plenty of
 * real images are square — but it corroborates.
 */
const GENERATOR_DIMENSIONS = new Set([
  '512x512', '768x768', '1024x1024', '1536x1536', '2048x2048',
  '512x768', '768x512', '832x1216', '1216x832', '896x1152', '1152x896',
  '1024x1536', '1536x1024', '1024x1792', '1792x1024', '1344x768', '768x1344',
  '1152x2048', '2048x1152', '1440x1440',
]);

/**
 * The C2PA manifest is embedded as a JUMBF box; a full parse needs the C2PA
 * SDK. Detecting the marker is enough to answer the only question the report
 * asks — is provenance attached at all — without claiming to have verified it.
 */
const C2PA_MARKERS = ['c2pa', 'jumbf', 'urn:uuid:c2pa'];

export async function inspectImage(buffer: Buffer): Promise<MetadataFindings> {
  const signals: MediaSignal[] = [];
  const details: Record<string, unknown> = {};

  let width: number | null = null;
  let height: number | null = null;
  let format: string | undefined;

  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    format = meta.format;
    details.format = format;
    details.space = meta.space;
    details.hasProfile = meta.hasProfile;
    details.density = meta.density;
  } catch {
    details.sharpError = 'Image could not be decoded for metadata inspection.';
  }

  let exif: Record<string, unknown> | null = null;
  try {
    exif = (await exifr.parse(buffer, { tiff: true, exif: true })) ?? null;
  } catch {
    exif = null;
  }
  details.exif = exif
    ? {
        make: exif.Make,
        model: exif.Model,
        lensModel: exif.LensModel,
        dateTimeOriginal: exif.DateTimeOriginal,
        software: exif.Software,
      }
    : null;

  const hasCameraExif = Boolean(exif?.Make ?? exif?.Model ?? exif?.DateTimeOriginal);

  // The file's own account of what made it, which outranks everything else
  // here. Checked first so the remaining signals can be phrased against it.
  const signatures = scanForGeneratorSignatures(buffer, exif);
  const conclusive = signatures.some((s) => s.strength === 'conclusive');
  details.generatorSignatures = signatures;

  for (const signature of signatures) {
    signals.push({
      id: `generator-${signature.source}`,
      label: signature.tool
        ? `Generator signature: ${signature.tool}`
        : 'Generator signature in metadata',
      detail: signature.detail,
      triggered: true,
      band: signature.strength === 'suggestive' ? 'medium' : 'high',
    });
  }

  signals.push({
    id: 'exif',
    label: 'EXIF metadata',
    detail: hasCameraExif
      ? `Camera metadata present (${[exif?.Make, exif?.Model].filter(Boolean).join(' ') || 'unnamed device'}). Consistent with a camera original, though EXIF is trivially forged and does not rule out generation.`
      : 'No camera make, model, lens or capture time. Stripped metadata is routine for exports, screenshots and re-shares, so this is weak evidence on its own.',
    triggered: !hasCameraExif,
    band: hasCameraExif ? 'none' : 'medium',
  });

  // An editing tool explains away missing capture metadata. A *generation*
  // tool is the opposite, and is reported above as a generator signature —
  // this branch deliberately fires only for the innocent case.
  const software = typeof exif?.Software === 'string' ? exif.Software : null;
  const softwareIsGenerator = signatures.some(
    (sig) => sig.source === 'exif' && software !== null,
  );
  if (software && !softwareIsGenerator) {
    signals.push({
      id: 'software',
      label: 'Editing software tag',
      detail: `Processed by "${software}". An editor, not a generator: it explains altered or missing capture metadata without implying generation.`,
      triggered: false,
      band: 'none',
    });
  }

  const dimensionKey = width && height ? `${width}x${height}` : null;
  if (dimensionKey && GENERATOR_DIMENSIONS.has(dimensionKey)) {
    signals.push({
      id: 'dimensions',
      label: 'Output dimensions',
      detail: `${dimensionKey} is a standard output size for image generators. On its own this means little — plenty of real images are cropped square — but it corroborates other signals.`,
      triggered: true,
      band: 'medium',
    });
  }

  const haystack = buffer
    .subarray(0, Math.min(buffer.length, 256 * 1024))
    .toString('latin1')
    .toLowerCase();
  const hasC2pa = C2PA_MARKERS.some((marker) => haystack.includes(marker));
  details.c2paMarkerFound = hasC2pa;

  signals.push({
    id: 'c2pa',
    label: 'C2PA content credentials',
    detail: hasC2pa
      ? 'A content-credentials manifest is attached. Note that generators including DALL·E and Firefly attach these too, so presence indicates provenance is recorded — not that the image is a photograph. The signature is not verified here.'
      : 'No signed provenance manifest attached to the file.',
    triggered: !hasC2pa,
    band: hasC2pa ? 'none' : 'medium',
  });

  // Absent a generator signature, metadata is genuinely weak and is capped
  // below the review threshold — stripped EXIF is ordinary. A signature is
  // different in kind: the file is stating what made it.
  const signatureScore = scoreSignatures(signatures);
  const weakSignals = signals.filter(
    (s) => s.triggered && !s.id.startsWith('generator-'),
  ).length;
  const score = Math.max(signatureScore, Math.min(55, weakSignals * 18));

  return { signals, score, width, height, signatures, conclusive, details };
}
