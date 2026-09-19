import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes duplicate rewrite suggestions for the same span and dialect.
 *
 * Before `generateForSpans` replaced instead of appending, regenerating left a
 * second live suggestion per span. Accepting both produced two replacements for
 * identical offsets, which made `GET /jobs/:id/export` throw and return 500.
 *
 * Keeps the most recently updated row per (jobId, spanId, dialect), then adds a
 * unique index so the situation cannot recur at the database level, whatever
 * the application does. Span-less rewrites (whole-document) are excluded: they
 * have no offsets to collide over.
 */
export class DedupeRewrites1789212000000 implements MigrationInterface {
  name = 'DedupeRewrites1789212000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "rewrites" r
      USING "rewrites" newer
      WHERE r."spanId" IS NOT NULL
        AND r."spanId" = newer."spanId"
        AND r."jobId"  = newer."jobId"
        AND r."dialect" = newer."dialect"
        AND (
          r."updatedAt" < newer."updatedAt"
          OR (r."updatedAt" = newer."updatedAt" AND r."id" < newer."id")
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_rewrites_job_span_dialect"
      ON "rewrites" ("jobId", "spanId", "dialect")
      WHERE "spanId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_rewrites_job_span_dialect"`);
  }
}
