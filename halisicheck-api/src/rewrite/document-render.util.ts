import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { splitIntoBlocks } from './chunking.util.js';

export const EXPORT_FORMATS = ['txt', 'docx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface RenderedDocument {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/**
 * Renders the finished document for download.
 *
 * Headings are laid out as headings rather than as body text. The block
 * classifier that keeps the rewriter away from headings already knows which
 * lines are which, so reusing it here means a downloaded DOCX or PDF carries
 * the document's structure instead of flattening it into one wall of prose —
 * which is all a .txt can ever be.
 */
export async function renderDocument(
  text: string,
  format: ExportFormat,
  title: string,
): Promise<RenderedDocument> {
  switch (format) {
    case 'txt':
      return {
        buffer: Buffer.from(text, 'utf8'),
        contentType: CONTENT_TYPES.txt,
        extension: 'txt',
      };
    case 'docx':
      return {
        buffer: await renderDocx(text, title),
        contentType: CONTENT_TYPES.docx,
        extension: 'docx',
      };
    case 'pdf':
      return {
        buffer: await renderPdf(text, title),
        contentType: CONTENT_TYPES.pdf,
        extension: 'pdf',
      };
  }
}

/** A block with no sentence structure is a heading; the rest is body text. */
function structuredBlocks(text: string): { text: string; heading: boolean }[] {
  const blocks = splitIntoBlocks(text);

  if (blocks.length === 0) {
    return text.trim().length > 0 ? [{ text: text.trim(), heading: false }] : [];
  }

  return blocks.map((block) => ({
    text: block.text.trim(),
    // `rewritable === false` means the classifier read it as a heading, label
    // or field line.
    heading: !block.rewritable,
  }));
}

async function renderDocx(text: string, title: string): Promise<Buffer> {
  const blocks = structuredBlocks(text);

  const children = blocks.map((block) =>
    block.heading
      ? new Paragraph({
          text: block.text,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        })
      : new Paragraph({
          children: [new TextRun({ text: block.text })],
          spacing: { after: 200, line: 320 },
        }),
  );

  const document = new Document({
    creator: 'HalisiCheck',
    title,
    description: 'Document exported from HalisiCheck after human review.',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {},
        children:
          children.length > 0
            ? children
            : [new Paragraph({ children: [new TextRun({ text: '' })] })],
      },
    ],
  });

  return Packer.toBuffer(document);
}

function renderPdf(text: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      info: { Title: title, Creator: 'HalisiCheck' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blocks = structuredBlocks(text);

    if (blocks.length === 0) {
      // pdfkit produces an invalid file if nothing is ever written.
      doc.font('Helvetica').fontSize(11).text(' ');
    }

    blocks.forEach((block, index) => {
      if (index > 0) doc.moveDown(block.heading ? 0.9 : 0.6);

      if (block.heading) {
        doc.font('Helvetica-Bold').fontSize(12.5).text(block.text, { align: 'left' });
      } else {
        doc
          .font('Helvetica')
          .fontSize(11)
          .text(block.text, { align: 'left', lineGap: 3.5 });
      }
    });

    doc.end();
  });
}

/** A filesystem-safe base name derived from the source filename. */
export function safeBaseName(sourceName: string): string {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'document';
}
