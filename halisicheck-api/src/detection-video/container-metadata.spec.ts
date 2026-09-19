import { describe, expect, it } from 'vitest';
import { inspectContainer } from './container-metadata.util.js';

/** A stand-in MP4: ftyp header plus a udta atom carrying an encoder tag. */
function mp4WithEncoder(encoder: string): Buffer {
  const ftyp = Buffer.from('\x00\x00\x00\x20ftypisomisomiso2avc1mp41', 'latin1');
  const udta = Buffer.from(`udta\x00\x00\x00\x00meta\xa9too${encoder}\x00`, 'latin1');
  return Buffer.concat([ftyp, Buffer.alloc(512), udta, Buffer.alloc(256)]);
}

function webmWithWritingApp(app: string): Buffer {
  const header = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const body = Buffer.from(`WritingApp\x00\x00${app}\x00MuxingApp\x00\x00libwebm`, 'latin1');
  return Buffer.concat([header, Buffer.alloc(128), body, Buffer.alloc(128)]);
}

describe('inspectContainer', () => {
  it('finds a video generator named in the MP4 encoder tag', () => {
    const r = inspectContainer(mp4WithEncoder('Sora'));
    expect(r.signatures.some((s) => s.tool === 'Sora')).toBe(true);
    expect(r.score).toBeGreaterThan(80);
  });

  it('finds Runway, Pika, Kling and Veo', () => {
    for (const [encoder, tool] of [
      ['RunwayML Gen-3', 'Runway'],
      ['Pika Labs', 'Pika'],
      ['Kling AI', 'Kling'],
      ['Google Veo 3', 'Google Veo'],
    ] as const) {
      const r = inspectContainer(mp4WithEncoder(encoder));
      expect(r.signatures.some((s) => s.tool === tool), `${encoder} -> ${tool}`).toBe(true);
    }
  });

  it('finds a generator in a WebM WritingApp element', () => {
    const r = inspectContainer(webmWithWritingApp('Stable Video Diffusion'));
    expect(r.signatures.length).toBeGreaterThan(0);
  });

  it('finds the IPTC synthetic-media marker in a C2PA claim', () => {
    const withClaim = Buffer.concat([
      mp4WithEncoder('Lavf60.16.100'),
      Buffer.from('uuid c2pa digitalSourceType trainedAlgorithmicMedia', 'latin1'),
    ]);
    const r = inspectContainer(withClaim);
    expect(r.conclusive).toBe(true);
  });

  it('does not flag an ordinary camera or ffmpeg encode', () => {
    for (const encoder of ['Lavf60.16.100', 'HandBrake 1.7.3', 'Apple QuickTime', 'GoPro AVC encoder']) {
      const r = inspectContainer(mp4WithEncoder(encoder));
      expect(r.signatures, encoder).toEqual([]);
      expect(r.score).toBe(0);
    }
  });

  it('extracts the encoder tag for the audit trail', () => {
    expect(inspectContainer(mp4WithEncoder('Lavf60.16.100')).tags.encoder).toContain('Lavf');
  });

  it('reads metadata at the end of the file as well as the start', () => {
    const trailing = Buffer.concat([
      Buffer.from('\x00\x00\x00\x20ftypisom', 'latin1'),
      Buffer.alloc(600 * 1024),
      Buffer.from('udta\xa9tooSora\x00', 'latin1'),
    ]);
    expect(inspectContainer(trailing).signatures.some((s) => s.tool === 'Sora')).toBe(true);
  });

  it('handles an empty or tiny buffer', () => {
    expect(() => inspectContainer(Buffer.alloc(0))).not.toThrow();
    expect(inspectContainer(Buffer.alloc(0)).score).toBe(0);
  });
});
