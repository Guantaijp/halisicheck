import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import type { AppConfig } from '../config/configuration.js';
import { MediaAsset } from './entities/media-asset.entity.js';

/**
 * Storage boundary. Controllers and detectors only ever see opaque keys, so
 * swapping the local driver for S3 later touches this file and nothing else.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly cfg: AppConfig['storage'];

  constructor(
    @InjectRepository(MediaAsset)
    private readonly assetRepo: Repository<MediaAsset>,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<AppConfig['storage']>('storage');
    if (this.cfg.driver !== 'local') {
      this.logger.warn(
        `STORAGE_DRIVER="${this.cfg.driver}" is not implemented yet; falling back to local disk.`,
      );
    }
  }

  private get root(): string {
    return resolve(this.cfg.localRoot);
  }

  /**
   * Resolves a storage key to an absolute path, refusing anything that escapes
   * the storage root. Keys are generated internally today, but this is the
   * single choke point where a traversal would land if that ever changed.
   */
  private resolveKey(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error(`Storage key "${key}" escapes the storage root.`);
    }
    return full;
  }

  async store(jobId: string, file: { buffer: Buffer; originalname: string }): Promise<string> {
    const key = join(jobId, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.buffer);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolveKey(key)).catch(() => undefined);
  }

  /** Absolute path, for tools such as ffmpeg that need a real file. */
  absolutePath(key: string): string {
    return this.resolveKey(key);
  }

  /**
   * A bounded preview of a stored image.
   *
   * Reports show the file the reader uploaded, and serving a 25 MB original
   * into an <img> to display it at 200px is wasteful. Falls back to the
   * original bytes for anything sharp cannot decode, so the caller always gets
   * something displayable.
   */
  async imagePreview(
    key: string,
    maxEdge = 1200,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const original = await this.read(key);
    try {
      const buffer = await sharp(original)
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();
      return { buffer, contentType: 'image/jpeg' };
    } catch {
      return { buffer: original, contentType: 'application/octet-stream' };
    }
  }

  checksum(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  createAsset(data: Partial<MediaAsset>): MediaAsset {
    return this.assetRepo.create(data);
  }

  async saveAsset(asset: MediaAsset): Promise<MediaAsset> {
    return this.assetRepo.save(asset);
  }

  async findByJob(jobId: string): Promise<MediaAsset | null> {
    return this.assetRepo.findOne({ where: { jobId } });
  }
}
