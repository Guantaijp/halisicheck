import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DIALECTS, type Dialect } from '../../rewrite/entities/rewrite.entity.js';
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from '../../rewrite/document-render.util.js';

export class CreateTextJobDto {
  @ApiProperty({ description: 'The text to analyse.', minLength: 1 })
  @IsString()
  @MinLength(1, { message: 'Text cannot be empty.' })
  @MaxLength(200_000, { message: 'Text is too long; split it into smaller documents.' })
  text: string;

  @ApiPropertyOptional({ description: 'Label shown in job history.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceName?: string;
}

export const REWRITE_SCOPES = ['spans', 'passage'] as const;
export type RewriteScope = (typeof REWRITE_SCOPES)[number];

export class GenerateRewritesDto {
  @ApiProperty({ enum: DIALECTS, example: 'british' })
  @IsIn(DIALECTS, { message: `Dialect must be one of: ${DIALECTS.join(', ')}.` })
  dialect: Dialect;

  @ApiPropertyOptional({
    enum: REWRITE_SCOPES,
    default: 'spans',
    description:
      "'spans' rewrites each flagged sentence separately. 'passage' rewrites the whole document in one pass, which is the only way to change sentence-length variation — but it is freer, so read the diff.",
  })
  @IsOptional()
  @IsIn(REWRITE_SCOPES, {
    message: `Scope must be one of: ${REWRITE_SCOPES.join(', ')}.`,
  })
  scope?: RewriteScope;

  @ApiPropertyOptional({
    description: 'Spans to rewrite. Omit to rewrite every flagged span.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  spanIds?: string[];
}

export class DecideRewriteDto {
  @ApiProperty({
    description: 'true to accept, false to reject, null to return it to review.',
    nullable: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  accepted: boolean | null;
}

export class SaveDocumentDto {
  @ApiProperty({
    description: "The reviewer's edited version of the document.",
    maxLength: 500_000,
  })
  @IsString()
  @MaxLength(500_000, { message: 'Document is too long to store.' })
  text: string;
}

export class RenderDocumentDto {
  @ApiProperty({
    description:
      'The exact text to render. Sent by the client so a download reflects what is on screen, including edits not yet saved.',
    maxLength: 500_000,
  })
  @IsString()
  @MaxLength(500_000, { message: 'Document is too long to render.' })
  text: string;

  @ApiProperty({ enum: EXPORT_FORMATS, example: 'docx' })
  @IsIn(EXPORT_FORMATS, {
    message: `Format must be one of: ${EXPORT_FORMATS.join(', ')}.`,
  })
  format: ExportFormat;
}
