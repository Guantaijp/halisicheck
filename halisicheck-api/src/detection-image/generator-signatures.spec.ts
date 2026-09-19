import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  readPngTextChunks,
  scanForGeneratorSignatures,
  scoreSignatures,
} from './generator-signatures.util.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Buffer): Buffer {
  const out = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from(type, 'latin1'),
    payload,
    Buffer.alloc(4),
  ]);
  out.writeUInt32BE(payload.length, 0);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), payload])), out.length - 4);
  return out;
}

function png(chunks: Buffer[] = []): Buffer {
  const ihdr = chunk('IHDR', Buffer.alloc(13));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([PNG_SIGNATURE, ihdr, ...chunks, iend]);
}

const textChunk = (keyword: string, text: string) =>
  chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]));

const zTextChunk = (keyword: string, text: string) =>
  chunk(
    'zTXt',
    Buffer.concat([
      Buffer.from(keyword, 'latin1'),
      Buffer.from([0, 0]),
      deflateSync(Buffer.from(text, 'latin1')),
    ]),
  );

const A1111 =
  'a portrait\nNegative prompt: blurry\nSteps: 30, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1234567890, Model hash: 6ce0161689';

describe('readPngTextChunks', () => {
  it('reads a tEXt chunk', () => {
    expect(readPngTextChunks(png([textChunk('parameters', A1111)]))).toEqual([
      { keyword: 'parameters', text: A1111 },
    ]);
  });

  it('reads a compressed zTXt chunk', () => {
    const entries = readPngTextChunks(png([zTextChunk('parameters', A1111)]));
    expect(entries[0].text).toBe(A1111);
  });

  it('returns nothing for a non-PNG', () => {
    expect(readPngTextChunks(Buffer.from('%PDF-1.7 not a png'))).toEqual([]);
  });

  it('does not throw on truncated data', () => {
    expect(() => readPngTextChunks(png([textChunk('a', 'b')]).subarray(0, 20))).not.toThrow();
  });
});

describe('scanForGeneratorSignatures', () => {
  it('finds Stable Diffusion generation parameters and calls them conclusive', () => {
    const found = scanForGeneratorSignatures(png([textChunk('parameters', A1111)]), null);
    expect(found.some((f) => f.strength === 'conclusive')).toBe(true);
    expect(scoreSignatures(found)).toBeGreaterThan(90);
  });

  it('finds a ComfyUI workflow graph', () => {
    const workflow = JSON.stringify({ nodes: [{ type: 'KSampler' }, { type: 'CheckpointLoader' }] });
    const found = scanForGeneratorSignatures(png([textChunk('workflow', workflow)]), null);
    expect(found.some((f) => f.strength === 'conclusive')).toBe(true);
  });

  it('treats a Midjourney EXIF Software tag as evidence, not an alibi', () => {
    // Regression: this used to be reported as "without implying generation".
    const found = scanForGeneratorSignatures(png(), { Software: 'Midjourney' });
    expect(found).toHaveLength(1);
    expect(found[0].tool).toBe('Midjourney');
    expect(found[0].strength).toBe('strong');
  });

  it('finds the IPTC synthetic-media marker that DALL-E and Firefly write', () => {
    const xmp = Buffer.from('<xmp><Iptc4xmpExt:digitalSourceType>trainedAlgorithmicMedia</...>');
    const found = scanForGeneratorSignatures(Buffer.concat([png(), xmp]), null);
    expect(found.some((f) => f.strength === 'conclusive')).toBe(true);
    expect(scoreSignatures(found)).toBeGreaterThan(90);
  });

  it('does not flag an ordinary camera file', () => {
    const found = scanForGeneratorSignatures(png(), {
      Make: 'NIKON CORPORATION',
      Model: 'NIKON D850',
      Software: 'Adobe Lightroom',
      DateTimeOriginal: '2024:03:11 14:02:31',
    });
    expect(found).toEqual([]);
    expect(scoreSignatures(found)).toBe(0);
  });

  it('does not flag ordinary editing software', () => {
    for (const software of ['Adobe Photoshop 25.0', 'GIMP 2.10', 'Affinity Photo', 'Snapseed']) {
      expect(scanForGeneratorSignatures(png(), { Software: software })).toEqual([]);
    }
  });

  it('scores conclusive above strong above suggestive', () => {
    expect(scoreSignatures([{ source: 'x', detail: '', strength: 'conclusive' }])).toBe(97);
    expect(scoreSignatures([{ source: 'x', detail: '', strength: 'strong' }])).toBe(85);
    expect(scoreSignatures([{ source: 'x', detail: '', strength: 'suggestive' }])).toBe(55);
    expect(scoreSignatures([])).toBe(0);
  });

  it('handles an empty buffer and null exif', () => {
    expect(() => scanForGeneratorSignatures(Buffer.alloc(0), null)).not.toThrow();
  });
});
