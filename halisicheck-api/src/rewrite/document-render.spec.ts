import { describe, expect, it } from 'vitest';
import { renderDocument, safeBaseName } from './document-render.util.js';

const DOC = [
  'World Plan: Wren Hollow Apartments Hail Claim',
  'Submission date: 09/11/2026',
  'World Setup',
  'Mobile money did not arrive here as a finished idea. It began as a pilot for repaying small loans, and the people running it were surprised by what users actually did with it.',
].join('\n\n');

describe('renderDocument', () => {
  it('renders TXT byte-for-byte', async () => {
    const r = await renderDocument(DOC, 'txt', 'doc.txt');
    expect(r.buffer.toString('utf8')).toBe(DOC);
    expect(r.extension).toBe('txt');
    expect(r.contentType).toMatch(/text\/plain/);
  });

  it('renders a real DOCX (a ZIP container)', async () => {
    const r = await renderDocument(DOC, 'docx', 'doc.txt');
    expect(r.buffer[0]).toBe(0x50);
    expect(r.buffer[1]).toBe(0x4b);
    expect(r.buffer.byteLength).toBeGreaterThan(2000);
    expect(r.extension).toBe('docx');
  });

  it('renders a real PDF', async () => {
    const r = await renderDocument(DOC, 'pdf', 'doc.txt');
    expect(r.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(r.buffer.subarray(-6).toString('latin1')).toContain('EOF');
    expect(r.extension).toBe('pdf');
  });

  it('keeps the document text in the DOCX payload', async () => {
    const { buffer } = await renderDocument(DOC, 'docx', 'doc.txt');
    // The XML inside the ZIP is deflated, so check the uncompressed size grew
    // with the content rather than parsing the container.
    const small = await renderDocument('Short.', 'docx', 'doc.txt');
    expect(buffer.byteLength).toBeGreaterThan(small.buffer.byteLength);
  });

  it('still produces structurally valid DOCX and PDF for empty input', async () => {
    // The endpoint refuses an empty document, but the renderer must not
    // produce a corrupt file if one ever reaches it.
    const docx = await renderDocument('', 'docx', 'doc.txt');
    expect(docx.buffer.subarray(0, 2).toString('latin1')).toBe('PK');

    const pdf = await renderDocument('', 'pdf', 'doc.txt');
    expect(pdf.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // An empty text file is legitimately zero bytes.
    expect((await renderDocument('', 'txt', 'doc.txt')).buffer.byteLength).toBe(0);
  });

  it('handles long documents without truncating', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `Paragraph ${i}. ${'word '.repeat(60)}`).join('\n\n');
    const pdf = await renderDocument(long, 'pdf', 'doc.txt');
    const short = await renderDocument('One line.', 'pdf', 'doc.txt');
    expect(pdf.buffer.byteLength).toBeGreaterThan(short.buffer.byteLength * 2);
  });

  it('handles em-dashes and curly quotes', async () => {
    const fancy = 'It’s here — and it’s staying. "Quoted," she said.';
    for (const format of ['txt', 'docx', 'pdf'] as const) {
      await expect(renderDocument(fancy, format, 'doc.txt')).resolves.toBeDefined();
    }
  });
});

describe('safeBaseName', () => {
  it('strips the extension', () => {
    expect(safeBaseName('world-plan.docx')).toBe('world-plan');
  });

  it('replaces spaces and drops unsafe characters', () => {
    expect(safeBaseName('My Report: v2/final.pdf')).toBe('My-Report-v2final');
  });

  it('falls back for an empty or unusable name', () => {
    expect(safeBaseName('')).toBe('document');
    expect(safeBaseName('///.txt')).toBe('document');
  });

  it('caps the length', () => {
    expect(safeBaseName('a'.repeat(300) + '.txt').length).toBeLessThanOrEqual(80);
  });

  it('handles a pasted-text label with quotes', () => {
    expect(safeBaseName('"Furthermore, it is worth noting…"')).not.toContain('"');
  });
});
