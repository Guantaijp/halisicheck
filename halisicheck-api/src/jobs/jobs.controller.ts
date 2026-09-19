import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  UnprocessableEntityException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard.js';
import {
  FileValidationPipe,
  type UploadedFileLike,
} from '../common/pipes/file-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy.js';
import { RewriteService } from '../rewrite/rewrite.service.js';
import { DetectionTextService } from '../detection-text/detection-text.service.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import { MediaService } from '../media/media.service.js';
import { JobsService } from './jobs.service.js';
import {
  CreateTextJobDto,
  DecideRewriteDto,
  GenerateRewritesDto,
  RenderDocumentDto,
  SaveDocumentDto,
} from './dto/job.dto.js';
import {
  renderDocument,
  safeBaseName,
} from '../rewrite/document-render.util.js';
import type { Job } from './entities/job.entity.js';

/** The finished document, in every version a reader might want. */
interface DocumentResponse {
  jobId: string;
  /** Whichever version should be treated as final. */
  text: string;
  /** Original with accepted rewrites spliced in. */
  derivedText: string;
  /** The extracted text, before any rewrite. */
  originalText: string;
  /** The reviewer's own version, if they saved one. */
  editedText: string | null;
  isEdited: boolean;
  appliedCount: number;
  editedAt: Date | null;
}

/** Summary the history view renders per row. */
interface JobSummaryResponse {
  score: number | null;
  confidenceMargin: number | null;
  band: 'low' | 'medium' | 'high' | null;
  flaggedSpans: number;
  wordCount: number | null;
}

/** Status shape returned while a caller polls. */
interface JobStatusResponse {
  id: string;
  type: string;
  status: string;
  progress: number;
  sourceName: string;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  resultUrl: string | null;
  /** Present only on the list endpoint. */
  summary?: JobSummaryResponse;
}

function toRewriteResponse(r: {
  id: string;
  spanId: string | null;
  dialect: string;
  originalText: string;
  rewrittenText: string;
  rationale: string | null;
  accepted: boolean | null;
}): Record<string, unknown> {
  return {
    id: r.id,
    spanId: r.spanId,
    dialect: r.dialect,
    originalText: r.originalText,
    rewrittenText: r.rewrittenText,
    rationale: r.rationale,
    accepted: r.accepted,
    /** Null spanId means the suggestion replaces the whole document. */
    scope: r.spanId === null ? 'passage' : 'span',
  };
}

function toStatus(job: Job): JobStatusResponse {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    sourceName: job.sourceName,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    resultUrl: job.status === 'done' ? `/jobs/${job.id}/result` : null,
  };
}

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly rewrite: RewriteService,
    private readonly detection: DetectionTextService,
    private readonly ingestion: IngestionService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('text')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Analyse pasted text',
    description:
      'Runs synchronously and returns a finished job. Authentication is optional; an anonymous job is readable by anyone holding its id.',
  })
  @ApiResponse({ status: 201, description: 'Analysis complete.' })
  async createTextJob(
    @Body() dto: CreateTextJobDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<JobStatusResponse> {
    const job = await this.jobs.createTextJob(user?.id ?? null, dto.text, dto.sourceName);
    return toStatus(job);
  }

  @Post('document')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary: 'Queue a PDF or DOCX for analysis',
    description: 'Returns immediately with a pending job. Poll GET /jobs/{id}.',
  })
  @UseInterceptors(FileInterceptor('file'))
  async createDocumentJob(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<JobStatusResponse> {
    // The type is decided by the file itself, so one endpoint serves both.
    const isPdf = file?.originalname?.toLowerCase().endsWith('.pdf') ?? false;
    const validated = new FileValidationPipe(isPdf ? 'pdf' : 'docx').transform(file);
    const job = await this.jobs.createFileJob(
      user?.id ?? null,
      isPdf ? 'pdf' : 'docx',
      validated,
    );
    return toStatus(job);
  }

  @Post('image')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Queue an image for detection (no rewrite path)' })
  @UseInterceptors(FileInterceptor('file'))
  async createImageJob(
    @UploadedFile(new FileValidationPipe('image')) file: UploadedFileLike,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<JobStatusResponse> {
    const job = await this.jobs.createFileJob(user?.id ?? null, 'image', file);
    return toStatus(job);
  }

  @Post('video')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Queue a video for detection (no rewrite path)' })
  @UseInterceptors(FileInterceptor('file'))
  async createVideoJob(
    @UploadedFile(new FileValidationPipe('video')) file: UploadedFileLike,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<JobStatusResponse> {
    const job = await this.jobs.createFileJob(user?.id ?? null, 'video', file);
    return toStatus(job);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List your jobs, newest first' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<JobStatusResponse[]> {
    const jobs = await this.jobs.listForUserWithSummary(
      user.id,
      Number(limit) || 50,
    );
    // The list carries each job's score so a history page renders from one
    // request rather than one request per row.
    return jobs.map((job) => ({ ...toStatus(job), summary: job.summary }));
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll job status' })
  @ApiResponse({ status: 404, description: 'No such job, or not yours.' })
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<JobStatusResponse> {
    return toStatus(await this.jobs.findById(id, user?.id ?? null));
  }

  @Get(':id/result')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fetch the full report',
    description:
      'Scores always arrive with a confidence interval and a caveat. There is no verdict field, by design.',
  })
  async result(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<Record<string, unknown>> {
    const job = await this.jobs.findById(id, user?.id ?? null);
    return this.jobs.buildResult(job);
  }

  @Post(':id/rewrites')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate rewrite suggestions for flagged spans',
    description:
      'Suggestions are stored awaiting review. Nothing is applied to the document until a human accepts it.',
  })
  async generateRewrites(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateRewritesDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<Record<string, unknown>[]> {
    const job = await this.jobs.findById(id, user?.id ?? null);

    // Whole-passage rewriting is the only thing that can change sentence-length
    // variation, which per-span rewriting structurally cannot touch.
    if (dto.scope === 'passage') {
      const document = await this.ingestion.findByJob(job.id);
      if (!document) {
        throw new NotFoundException('No document text for this job.');
      }
      const passage = await this.rewrite.rewriteWholePassage(
        job.id,
        document.extractedText,
        dto.dialect,
      );
      return [toRewriteResponse(passage)];
    }

    let spanIds = dto.spanIds;
    if (!spanIds || spanIds.length === 0) {
      const detection = await this.detection.findByJob(job.id);
      spanIds = (detection?.spans ?? []).map((span) => span.id);
    }

    const rewrites = await this.rewrite.generateForSpans(job.id, spanIds, dto.dialect);
    return rewrites.map(toRewriteResponse);
  }

  @Post('rewrites/:rewriteId/decision')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept or reject one rewrite' })
  async decide(
    @Param('rewriteId', ParseUUIDPipe) rewriteId: string,
    @Body() dto: DecideRewriteDto,
  ): Promise<Record<string, unknown>> {
    const rewrite = await this.rewrite.decide(rewriteId, dto.accepted ?? null);
    return { id: rewrite.id, accepted: rewrite.accepted };
  }

  @Get(':id/export')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The finished document',
    description:
      "Returns `derivedText` (the original with accepted rewrites spliced in) and `editedText` (the reviewer's own version, if they have saved one). `text` is whichever should be treated as final.",
  })
  async exportDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<DocumentResponse> {
    const job = await this.jobs.findById(id, user?.id ?? null);
    const document = await this.ingestion.findByJob(job.id);

    if (!document) {
      return {
        jobId: job.id,
        text: '',
        derivedText: '',
        originalText: '',
        editedText: null,
        isEdited: false,
        appliedCount: 0,
        editedAt: null,
      };
    }

    const rewrites = await this.rewrite.findByJob(job.id);
    const derivedText = await this.rewrite.applyAccepted(
      job.id,
      document.extractedText,
    );

    return {
      jobId: job.id,
      // A saved edit always wins: it is the most recent human decision.
      text: document.finalText ?? derivedText,
      derivedText,
      originalText: document.extractedText,
      editedText: document.finalText,
      isEdited: document.finalText !== null,
      appliedCount: rewrites.filter((r) => r.accepted === true).length,
      editedAt: document.finalTextUpdatedAt,
    };
  }

  @Get(':id/media')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @SkipThrottle({ short: true, long: true })
  @ApiOperation({
    summary: 'The uploaded image or video',
    description:
      'Serves the stored file so a report can show what was analysed. Images are returned as a bounded preview unless ?full=1 is passed.',
  })
  async media(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
    @Res({ passthrough: true }) response: Response,
    @Query('full') full?: string,
  ): Promise<StreamableFile> {
    const job = await this.jobs.findById(id, user?.id ?? null);
    const asset = await this.mediaService.findByJob(job.id);

    if (!asset) {
      throw new NotFoundException('No media stored for this job.');
    }

    const isImage = asset.mimeType.startsWith('image/');
    const wantsFull = full === '1' || full === 'true';

    const { buffer, contentType } =
      isImage && !wantsFull
        ? await this.mediaService.imagePreview(asset.filePath)
        : { buffer: await this.mediaService.read(asset.filePath), contentType: asset.mimeType };

    response.set({
      'Content-Type': contentType,
      // Inline so a browser renders it rather than offering a download.
      'Content-Disposition': 'inline',
      // The analysed file never changes, so it is safe to cache hard. Private
      // because a job may belong to one account.
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Length': String(buffer.byteLength),
    });

    return new StreamableFile(buffer);
  }

  @Post(':id/document/render')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Render the document as TXT, DOCX or PDF',
    description:
      'The text is supplied by the caller rather than read from storage, so a download reflects exactly what the reviewer has on screen — including edits they have not saved yet. Headings are laid out as headings in DOCX and PDF.',
  })
  async renderDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderDocumentDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const job = await this.jobs.findById(id, user?.id ?? null);

    if (dto.text.trim().length === 0) {
      // A zero-byte download is worse than an error: it looks like it worked.
      throw new UnprocessableEntityException('There is nothing to download.');
    }

    const rendered = await renderDocument(dto.text, dto.format, job.sourceName);
    const filename = `${safeBaseName(job.sourceName)}-final.${rendered.extension}`;

    response.set({
      'Content-Type': rendered.contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(rendered.buffer.byteLength),
    });

    return new StreamableFile(rendered.buffer);
  }

  @Put(':id/document')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Save the reviewer's edited version of the document",
    description:
      'Stored alongside the extracted text, never over it — span offsets index into the original, so overwriting it would invalidate every flagged span.',
  })
  async saveDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveDocumentDto,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<{ jobId: string; savedAt: Date | null }> {
    const job = await this.jobs.findById(id, user?.id ?? null);
    const document = await this.ingestion.saveFinalText(job.id, dto.text);
    return { jobId: job.id, savedAt: document.finalTextUpdatedAt };
  }

  @Delete(':id/document')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Discard manual edits and revert to the derived document',
  })
  async resetDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<{ jobId: string }> {
    const job = await this.jobs.findById(id, user?.id ?? null);
    await this.ingestion.clearFinalText(job.id);
    return { jobId: job.id };
  }
}
