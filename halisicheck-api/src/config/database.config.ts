import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import type { AppConfig } from './configuration.js';

import { User } from '../users/entities/user.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { Document } from '../ingestion/entities/document.entity.js';
import { DetectionResult } from '../detection-text/entities/detection-result.entity.js';
import { DetectionSpan } from '../detection-text/entities/detection-span.entity.js';
import { Rewrite } from '../rewrite/entities/rewrite.entity.js';
import { MediaAsset } from '../media/entities/media-asset.entity.js';

/** Single source of truth for the entity list — used by Nest and by the CLI. */
export const ENTITIES = [
  User,
  Job,
  Document,
  DetectionResult,
  DetectionSpan,
  Rewrite,
  MediaAsset,
];

export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  const db = config.getOrThrow<AppConfig['database']>('database');
  return {
    type: 'postgres',
    url: db.url,
    entities: ENTITIES,
    migrations: ['dist/database/migrations/*.js'],
    synchronize: db.synchronize,
    logging: db.logging,
  };
}

/**
 * Standalone DataSource for the TypeORM CLI (`pnpm migration:run`). The CLI
 * boots without Nest, so it reads the environment directly.
 *
 * Migrations are globbed from `dist` rather than `src`: this file is loaded in
 * its compiled form, and Node cannot import the `.ts` sources. Every migration
 * script builds first for that reason.
 */
loadEnv();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://halisi:halisi@localhost:5433/halisicheck',
  entities: ENTITIES,
  migrations: ['dist/database/migrations/*.js'],
  synchronize: false,
});
