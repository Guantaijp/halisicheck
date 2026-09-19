import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFinalText1789209512351 implements MigrationInterface {
    name = 'AddFinalText1789209512351'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" ADD "finalText" text`);
        await queryRunner.query(`ALTER TABLE "documents" ADD "finalTextUpdatedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "detection_spans" ALTER COLUMN "reasons" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "media_assets" ALTER COLUMN "frameScores" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`ALTER TABLE "media_assets" ALTER COLUMN "signals" SET DEFAULT '[]'::jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "media_assets" ALTER COLUMN "signals" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "media_assets" ALTER COLUMN "frameScores" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "detection_spans" ALTER COLUMN "reasons" SET DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "finalTextUpdatedAt"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "finalText"`);
    }

}
