import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789205685537 implements MigrationInterface {
    name = 'InitialSchema1789205685537'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Entities use uuid_generate_v4() for primary keys, which lives in
        // uuid-ossp rather than in core Postgres.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jobId" uuid NOT NULL, "originalText" text, "extractedText" text NOT NULL, "sourceFilename" character varying(500), "extractionMethod" character varying(40) NOT NULL, "wordCount" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_7cbebe605a4741c5ce8399cdb4" UNIQUE ("jobId"), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7cbebe605a4741c5ce8399cdb4" ON "documents"  ("jobId") `);
        await queryRunner.query(`CREATE TABLE "detection_spans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "detectionResultId" uuid NOT NULL, "startOffset" integer NOT NULL, "endOffset" integer NOT NULL, "score" numeric(5,2) NOT NULL, "band" character varying(10) NOT NULL, "reasons" jsonb NOT NULL DEFAULT '[]'::jsonb, "text" text NOT NULL, "paragraphIndex" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_d2a08dc3275b56421e6022be668" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c495141af584e81d0aafc42894" ON "detection_spans"  ("detectionResultId") `);
        await queryRunner.query(`CREATE TYPE "public"."detection_results_verdictlabel_enum" AS ENUM('low', 'medium', 'high')`);
        await queryRunner.query(`CREATE TABLE "detection_results" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jobId" uuid NOT NULL, "score" numeric(5,2) NOT NULL, "confidenceMargin" numeric(5,2) NOT NULL DEFAULT '10', "verdictLabel" "public"."detection_results_verdictlabel_enum" NOT NULL, "modelUsed" character varying(200) NOT NULL, "rawOutput" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1df03497ed6e37ce2b6eabb0f75" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0087ef01960f412c2655c37243" ON "detection_results"  ("jobId") `);
        await queryRunner.query(`CREATE TYPE "public"."rewrites_dialect_enum" AS ENUM('british', 'kenyan')`);
        await queryRunner.query(`CREATE TABLE "rewrites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jobId" uuid NOT NULL, "spanId" uuid, "originalText" text NOT NULL, "rewrittenText" text NOT NULL, "dialect" "public"."rewrites_dialect_enum" NOT NULL, "accepted" boolean, "rationale" text, "modelUsed" character varying(200) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4a9a25ef2a638c1b9ba9ff034f2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cb5af0050ec585cd1134a06dbe" ON "rewrites"  ("jobId") `);
        await queryRunner.query(`CREATE TABLE "media_assets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jobId" uuid NOT NULL, "filePath" character varying(1000) NOT NULL, "mimeType" character varying(120) NOT NULL, "sizeBytes" bigint NOT NULL, "width" integer, "height" integer, "durationSeconds" numeric(10,3), "frameScores" jsonb NOT NULL DEFAULT '[]'::jsonb, "score" numeric(5,2), "confidenceMargin" numeric(5,2), "signals" jsonb NOT NULL DEFAULT '[]'::jsonb, "modelUsed" character varying(200), "audioNote" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ca47e9f67a5e5d8af1e75d66ee6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_82f179ec5bdf689c8f2d0b404f" ON "media_assets"  ("jobId") `);
        await queryRunner.query(`CREATE TYPE "public"."jobs_type_enum" AS ENUM('text', 'docx', 'pdf', 'image', 'video')`);
        await queryRunner.query(`CREATE TYPE "public"."jobs_status_enum" AS ENUM('pending', 'processing', 'done', 'failed')`);
        await queryRunner.query(`CREATE TABLE "jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "type" "public"."jobs_type_enum" NOT NULL, "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'pending', "sourceName" character varying(500) NOT NULL, "error" text, "progress" integer NOT NULL DEFAULT '0', "startedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_79ae682707059d5f7655db4212" ON "jobs"  ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_a0c30e3eb9649fe7fbcd336a63" ON "jobs"  ("status") `);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(320) NOT NULL, "passwordHash" character varying(120) NOT NULL, "displayName" character varying(120), "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_7cbebe605a4741c5ce8399cdb4f" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "detection_spans" ADD CONSTRAINT "FK_c495141af584e81d0aafc428942" FOREIGN KEY ("detectionResultId") REFERENCES "detection_results"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "detection_results" ADD CONSTRAINT "FK_0087ef01960f412c2655c37243e" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rewrites" ADD CONSTRAINT "FK_cb5af0050ec585cd1134a06dbea" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "rewrites" ADD CONSTRAINT "FK_9c0f729fa68051da6f40098cfb4" FOREIGN KEY ("spanId") REFERENCES "detection_spans"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "media_assets" ADD CONSTRAINT "FK_82f179ec5bdf689c8f2d0b404fb" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "jobs" ADD CONSTRAINT "FK_79ae682707059d5f7655db4212a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "jobs" DROP CONSTRAINT "FK_79ae682707059d5f7655db4212a"`);
        await queryRunner.query(`ALTER TABLE "media_assets" DROP CONSTRAINT "FK_82f179ec5bdf689c8f2d0b404fb"`);
        await queryRunner.query(`ALTER TABLE "rewrites" DROP CONSTRAINT "FK_9c0f729fa68051da6f40098cfb4"`);
        await queryRunner.query(`ALTER TABLE "rewrites" DROP CONSTRAINT "FK_cb5af0050ec585cd1134a06dbea"`);
        await queryRunner.query(`ALTER TABLE "detection_results" DROP CONSTRAINT "FK_0087ef01960f412c2655c37243e"`);
        await queryRunner.query(`ALTER TABLE "detection_spans" DROP CONSTRAINT "FK_c495141af584e81d0aafc428942"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_7cbebe605a4741c5ce8399cdb4f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a0c30e3eb9649fe7fbcd336a63"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_79ae682707059d5f7655db4212"`);
        await queryRunner.query(`DROP TABLE "jobs"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."jobs_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_82f179ec5bdf689c8f2d0b404f"`);
        await queryRunner.query(`DROP TABLE "media_assets"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cb5af0050ec585cd1134a06dbe"`);
        await queryRunner.query(`DROP TABLE "rewrites"`);
        await queryRunner.query(`DROP TYPE "public"."rewrites_dialect_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0087ef01960f412c2655c37243"`);
        await queryRunner.query(`DROP TABLE "detection_results"`);
        await queryRunner.query(`DROP TYPE "public"."detection_results_verdictlabel_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c495141af584e81d0aafc42894"`);
        await queryRunner.query(`DROP TABLE "detection_spans"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7cbebe605a4741c5ce8399cdb4"`);
        await queryRunner.query(`DROP TABLE "documents"`);
    }

}
