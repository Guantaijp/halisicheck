import { inflateSync } from 'node:zlib';

export interface GeneratorSignature {
  /** Where it was found: 'png-text', 'exif', 'xmp', 'c2pa', 'raw'. */
  source: string;
  /** Human-readable description of the evidence. */
  detail: string;
  /** 'conclusive' = the file states its own provenance. */
  strength: 'conclusive' | 'strong' | 'suggestive';
  /** Named tool, where one was identified. */
  tool?: string;
}

/**
 * Looks for provenance the generator left in the file itself.
 *
 * This is the highest-value signal available and it costs nothing: most image
 * generators record what made the image, and most pipelines never strip it.
 * Stable Diffusion writes its full prompt and sampler settings into a PNG text
 * chunk; ComfyUI embeds the entire workflow graph; DALL·E and Firefly write the
 * IPTC `digitalSourceType` of `trainedAlgorithmicMedia` through C2PA.
 *
 * Absence proves nothing — a screenshot or a re-encode drops all of it. But
 * presence is as close to conclusive as this system gets, and it must never be
 * read as an *alibi*, which is what an earlier version of this file did with
 * the EXIF `Software` tag.
 */

/** Tools that generate images. Matched case-insensitively as whole words. */
const GENERATOR_TOOLS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bstable[\s-]?diffusion\b/i, name: 'Stable Diffusion' },
  { pattern: /\bmidjourney\b/i, name: 'Midjourney' },
  { pattern: /\bdall[\s·.-]?e\b/i, name: 'DALL·E' },
  { pattern: /\badobe firefly\b/i, name: 'Adobe Firefly' },
  { pattern: /\bfirefly\b/i, name: 'Adobe Firefly' },
  { pattern: /\bcomfyui\b/i, name: 'ComfyUI' },
  { pattern: /\bautomatic1111\b/i, name: 'Automatic1111' },
  { pattern: /\binvoke\s?ai\b/i, name: 'InvokeAI' },
  { pattern: /\bnovel\s?ai\b/i, name: 'NovelAI' },
  { pattern: /\bleonardo\.?ai\b/i, name: 'Leonardo.Ai' },
  { pattern: /\bnightcafe\b/i, name: 'NightCafe' },
  { pattern: /\bcraiyon\b/i, name: 'Craiyon' },
  { pattern: /\bdreamstudio\b/i, name: 'DreamStudio' },
  { pattern: /\bimagen\b/i, name: 'Google Imagen' },
  { pattern: /\bflux\.1\b/i, name: 'FLUX' },
  { pattern: /\bplayground\s?ai\b/i, name: 'Playground AI' },
  { pattern: /\bgetimg\.ai\b/i, name: 'getimg.ai' },
  { pattern: /\bfooocus\b/i, name: 'Fooocus' },
  { pattern: /\bopenai\b/i, name: 'OpenAI' },
  // Video generators. In an MP4 these land in the encoder tag; in WebM, in
  // the WritingApp element.
  { pattern: /\bsora\b/i, name: 'Sora' },
  { pattern: /\brunway(ml)?\b/i, name: 'Runway' },
  { pattern: /\bpika(\s?labs)?\b/i, name: 'Pika' },
  { pattern: /\bkling(\s?ai)?\b/i, name: 'Kling' },
  { pattern: /\bluma(\s?(ai|labs))?\b/i, name: 'Luma' },
  { pattern: /\bveo\s?[23]?\b/i, name: 'Google Veo' },
  { pattern: /\bhaiper\b/i, name: 'Haiper' },
  { pattern: /\bhailuo\b/i, name: 'Hailuo' },
  { pattern: /\bsynthesia\b/i, name: 'Synthesia' },
  { pattern: /\bheygen\b/i, name: 'HeyGen' },
  { pattern: /\bstable\s?video\b/i, name: 'Stable Video Diffusion' },
  { pattern: /\banimatediff\b/i, name: 'AnimateDiff' },
  { pattern: /\bdeepfacelab\b/i, name: 'DeepFaceLab' },
  { pattern: /\bfaceswap\b/i, name: 'FaceSwap' },
];

/**
 * Parameter vocabulary that only appears in generation metadata. Two or more
 * together is conclusive; one alone could plausibly be coincidence.
 */
const GENERATION_PARAMETERS = [
  /negative prompt\s*:/i,
  /\bcfg[\s_]?scale\s*:/i,
  /\bsampler\s*:/i,
  /\bdenoising strength\s*:/i,
  /\bmodel hash\s*:/i,
  /\bsteps\s*:\s*\d+/i,
  /\bseed\s*:\s*-?\d{3,}/i,
  /\bclip skip\s*:/i,
  /\bckpt\b/i,
  /\blora\b/i,
];

/** PNG text keys that generators are known to write into. */
const GENERATOR_PNG_KEYS = new Set([
  'parameters',
  'workflow',
  'prompt',
  'sd-metadata',
  'dream',
  'comment',
  'generation_data',
  'invokeai_metadata',
  'aiparams',
]);

/**
 * IPTC digital source type for synthetic media. Written through C2PA by
 * DALL·E 3, Firefly and others, and the nearest thing to a standard marker.
 */
const IPTC_SYNTHETIC = [
  { token: 'trainedalgorithmicmedia', label: 'trainedAlgorithmicMedia' },
  { token: 'compositewithtrainedalgorithmicmedia', label: 'compositeWithTrainedAlgorithmicMedia' },
  { token: 'algorithmicmedia', label: 'algorithmicMedia' },
];

export interface PngTextEntry {
  keyword: string;
  text: string;
}

/**
 * Reads tEXt, zTXt and iTXt chunks. Node's own zlib handles the compressed
 * variants, so no dependency is needed.
 */
export function readPngTextChunks(buffer: Buffer): PngTextEntry[] {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) return [];

  const entries: PngTextEntry[] = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (length < 0 || dataEnd > buffer.length) break;
    if (type === 'IEND') break;

    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const data = buffer.subarray(dataStart, dataEnd);
      const nul = data.indexOf(0);

      if (nul > 0) {
        const keyword = data.subarray(0, nul).toString('latin1');
        try {
          if (type === 'tEXt') {
            entries.push({ keyword, text: data.subarray(nul + 1).toString('latin1') });
          } else if (type === 'zTXt') {
            // keyword \0 compressionMethod compressedData
            entries.push({
              keyword,
              text: inflateSync(data.subarray(nul + 2)).toString('latin1'),
            });
          } else {
            // iTXt: keyword \0 flag method langTag \0 translatedKeyword \0 text
            const compressed = data[nul + 1] === 1;
            let cursor = nul + 3;
            for (let skipped = 0; skipped < 2 && cursor < data.length; skipped++) {
              const next = data.indexOf(0, cursor);
              if (next === -1) break;
              cursor = next + 1;
            }
            const payload = data.subarray(cursor);
            entries.push({
              keyword,
              text: compressed
                ? inflateSync(payload).toString('utf8')
                : payload.toString('utf8'),
            });
          }
        } catch {
          // A malformed or truncated chunk is not worth failing the scan for.
        }
      }
    }

    // length + type + data + CRC
    offset = dataEnd + 4;
  }

  return entries;
}

function identifyTool(text: string): string | undefined {
  for (const { pattern, name } of GENERATOR_TOOLS) {
    if (pattern.test(text)) return name;
  }
  return undefined;
}

function countParameters(text: string): number {
  return GENERATION_PARAMETERS.filter((p) => p.test(text)).length;
}

export function scanForGeneratorSignatures(
  buffer: Buffer,
  exif: Record<string, unknown> | null,
): GeneratorSignature[] {
  const found: GeneratorSignature[] = [];

  // --- PNG text chunks: where most local generators write everything ---
  for (const { keyword, text } of readPngTextChunks(buffer)) {
    const key = keyword.toLowerCase();
    const tool = identifyTool(`${keyword} ${text}`);
    const parameterHits = countParameters(text);

    if (parameterHits >= 2) {
      found.push({
        source: 'png-text',
        strength: 'conclusive',
        tool,
        detail: `The PNG carries generation parameters in its "${keyword}" text chunk${tool ? ` (${tool})` : ''}. ${parameterHits} generator-specific fields are present, such as sampler, seed or CFG scale. Cameras and editors do not write these.`,
      });
    } else if (tool && GENERATOR_PNG_KEYS.has(key)) {
      found.push({
        source: 'png-text',
        strength: 'conclusive',
        tool,
        detail: `The PNG names ${tool} in its "${keyword}" text chunk.`,
      });
    } else if (key === 'workflow' || key === 'prompt') {
      // ComfyUI embeds its whole node graph under these keys.
      if (/\b(ksampler|checkpointloader|cliptextencode|latentimage|nodes)\b/i.test(text)) {
        found.push({
          source: 'png-text',
          strength: 'conclusive',
          tool: tool ?? 'ComfyUI',
          detail: `The PNG embeds an image-generation workflow graph in its "${keyword}" chunk.`,
        });
      }
    } else if (tool) {
      found.push({
        source: 'png-text',
        strength: 'strong',
        tool,
        detail: `${tool} is named in the PNG "${keyword}" text chunk.`,
      });
    }
  }

  // --- EXIF: Software and friends ---
  // Image fields and video-container tag names, so both callers are served
  // by one scanner rather than two that drift apart.
  const exifStrings = [
    'Software', 'ImageDescription', 'Artist', 'Copyright', 'UserComment', 'XPComment',
    'encoder', 'comment', 'title', 'handler', 'writingApp', 'muxingApp',
  ]
    .map((field) => exif?.[field])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  for (const value of exifStrings) {
    const tool = identifyTool(value);
    if (tool) {
      found.push({
        source: 'exif',
        strength: 'strong',
        tool,
        detail: `EXIF metadata names ${tool} ("${value.slice(0, 80)}").`,
      });
    } else if (countParameters(value) >= 2) {
      found.push({
        source: 'exif',
        strength: 'conclusive',
        detail: `EXIF metadata contains generation parameters ("${value.slice(0, 80)}").`,
      });
    }
  }

  // --- Raw scan for XMP and C2PA claims ---
  // Generators write these near the head of the file; a bounded scan keeps
  // this cheap on large images.
  const window = buffer.subarray(0, Math.min(buffer.length, 512 * 1024)).toString('latin1');
  const lower = window.toLowerCase();

  for (const { token, label } of IPTC_SYNTHETIC) {
    if (lower.includes(token)) {
      found.push({
        source: 'xmp',
        strength: 'conclusive',
        detail: `The file declares an IPTC digital source type of "${label}" — the standard marker for content created by a generative model. Written by DALL·E, Adobe Firefly and others.`,
      });
      break;
    }
  }

  if (/\bgenai\b|\bai[\s_-]?generated\b|\bsynthetic[\s_-]?media\b/i.test(window)) {
    found.push({
      source: 'raw',
      strength: 'strong',
      detail: 'The file contains an explicit AI-generated marker in its metadata.',
    });
  }

  const rawTool = identifyTool(window);
  if (rawTool && !found.some((f) => f.tool === rawTool)) {
    found.push({
      source: 'raw',
      strength: 'suggestive',
      tool: rawTool,
      detail: `"${rawTool}" appears in the file metadata. Weaker than a structured tag — it could be part of a filename or caption.`,
    });
  }

  // De-duplicate on the evidence itself.
  const seen = new Set<string>();
  return found.filter((f) => {
    const key = `${f.source}|${f.tool ?? ''}|${f.strength}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 0–100 from provenance alone. Conclusive evidence should dominate. */
export function scoreSignatures(signatures: GeneratorSignature[]): number {
  if (signatures.length === 0) return 0;
  if (signatures.some((s) => s.strength === 'conclusive')) return 97;
  if (signatures.some((s) => s.strength === 'strong')) return 85;
  return 55;
}
