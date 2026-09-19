import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type PipeTransform,
} from '@nestjs/common';
import { extname } from 'node:path';
import type { JobType } from '../../jobs/entities/job.entity.js';

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Per-type allow-list of extension and MIME pairs.
 *
 * Both are checked. A browser-supplied MIME type is trivially spoofed, and an
 * extension says nothing about content, so neither alone is worth much; the
 * magic-number check below is what actually confirms the format.
 */
const RULES: Record<
  Exclude<JobType, 'text'>,
  { extensions: string[]; mimes: RegExp; maxBytes: number }
> = {
  pdf: {
    extensions: ['.pdf'],
    mimes: /^application\/pdf$/,
    maxBytes: 50 * 1024 * 1024,
  },
  docx: {
    extensions: ['.docx'],
    mimes: /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
    maxBytes: 25 * 1024 * 1024,
  },
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.webp'],
    mimes: /^image\/(jpeg|png|webp)$/,
    maxBytes: 25 * 1024 * 1024,
  },
  video: {
    extensions: ['.mp4', '.mov', '.webm'],
    mimes: /^video\/(mp4|quicktime|webm|x-matroska)$/,
    maxBytes: 200 * 1024 * 1024,
  },
};

/** Leading bytes that identify each container. */
const MAGIC: { test: (b: Buffer) => boolean; label: string }[] = [
  { label: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  // DOCX is a ZIP container.
  { label: 'zip', test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { label: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    label: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    label: 'webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  { label: 'mp4', test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' },
  {
    label: 'webm',
    test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
];

const EXPECTED_MAGIC: Record<Exclude<JobType, 'text'>, string[]> = {
  pdf: ['pdf'],
  docx: ['zip'],
  image: ['jpeg', 'png', 'webp'],
  video: ['mp4', 'webm'],
};

export function detectMagic(buffer: Buffer): string | null {
  return MAGIC.find((entry) => entry.test(buffer))?.label ?? null;
}

/**
 * Validates an upload against the declared job type. Constructed per route
 * rather than injected, so each endpoint states the type it accepts.
 */
@Injectable()
export class FileValidationPipe implements PipeTransform<UploadedFileLike | undefined> {
  constructor(private readonly type: Exclude<JobType, 'text'>) {}

  transform(file: UploadedFileLike | undefined): UploadedFileLike {
    if (!file) {
      throw new BadRequestException('A file upload is required for this job type.');
    }

    const rule = RULES[this.type];
    const extension = extname(file.originalname).toLowerCase();

    if (!rule.extensions.includes(extension)) {
      throw new UnsupportedMediaTypeException(
        `"${extension || 'no extension'}" is not accepted for a ${this.type} job. Expected one of: ${rule.extensions.join(', ')}.`,
      );
    }

    if (!rule.mimes.test(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Content type "${file.mimetype}" is not accepted for a ${this.type} job.`,
      );
    }

    if (file.size > rule.maxBytes) {
      throw new PayloadTooLargeException(
        `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit for ${this.type} is ${(rule.maxBytes / 1024 / 1024).toFixed(0)} MB.`,
      );
    }

    if (file.buffer.length === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }

    const magic = detectMagic(file.buffer);
    if (magic === null || !EXPECTED_MAGIC[this.type].includes(magic)) {
      throw new UnsupportedMediaTypeException(
        `File contents do not match a ${this.type} file, whatever the name and content type claim.`,
      );
    }

    return file;
  }
}
