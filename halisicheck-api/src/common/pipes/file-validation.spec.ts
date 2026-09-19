import { describe, expect, it } from 'vitest';
import { FileValidationPipe, detectMagic, type UploadedFileLike } from './file-validation.pipe.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
const PNG = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(100),
]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);

function file(over: Partial<UploadedFileLike> = {}): UploadedFileLike {
  return {
    buffer: PDF,
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
    size: PDF.length,
    ...over,
  };
}

describe('detectMagic', () => {
  it('identifies known containers', () => {
    expect(detectMagic(PDF)).toBe('pdf');
    expect(detectMagic(PNG)).toBe('png');
    expect(detectMagic(ZIP)).toBe('zip');
  });

  it('returns null for unrecognised bytes', () => {
    expect(detectMagic(Buffer.from('just some text here'))).toBeNull();
  });
});

describe('FileValidationPipe', () => {
  it('accepts a well-formed upload', () => {
    const pipe = new FileValidationPipe('pdf');
    expect(pipe.transform(file())).toBeDefined();
  });

  it('rejects a missing file', () => {
    expect(() => new FileValidationPipe('pdf').transform(undefined)).toThrow(
      /file upload is required/i,
    );
  });

  it('rejects a wrong extension', () => {
    expect(() =>
      new FileValidationPipe('pdf').transform(file({ originalname: 'report.exe' })),
    ).toThrow(/not accepted/i);
  });

  it('rejects a wrong content type', () => {
    expect(() =>
      new FileValidationPipe('pdf').transform(file({ mimetype: 'text/html' })),
    ).toThrow(/Content type/i);
  });

  it('rejects a file whose contents contradict its name and type', () => {
    // A PNG renamed to .pdf, with the PDF content type declared.
    expect(() =>
      new FileValidationPipe('pdf').transform(file({ buffer: PNG, size: PNG.length })),
    ).toThrow(/do not match/i);
  });

  it('rejects an empty file', () => {
    expect(() =>
      new FileValidationPipe('pdf').transform(
        file({ buffer: Buffer.alloc(0), size: 0 }),
      ),
    ).toThrow(/empty/i);
  });

  it('rejects a file over the per-type size limit', () => {
    expect(() =>
      new FileValidationPipe('pdf').transform(file({ size: 999 * 1024 * 1024 })),
    ).toThrow(/limit/i);
  });

  it('accepts docx as a zip container', () => {
    const pipe = new FileValidationPipe('docx');
    expect(
      pipe.transform(
        file({
          buffer: ZIP,
          size: ZIP.length,
          originalname: 'essay.docx',
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ),
    ).toBeDefined();
  });

  it('accepts png for an image job', () => {
    const pipe = new FileValidationPipe('image');
    expect(
      pipe.transform(
        file({ buffer: PNG, size: PNG.length, originalname: 'p.png', mimetype: 'image/png' }),
      ),
    ).toBeDefined();
  });
});
