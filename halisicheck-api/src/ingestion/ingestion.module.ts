import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from './entities/document.entity.js';
import { IngestionService } from './ingestion.service.js';
import { PdfExtractor } from './extractors/pdf.extractor.js';
import { DocxExtractor } from './extractors/docx.extractor.js';
import { OcrExtractor } from './extractors/ocr.extractor.js';

@Module({
  imports: [TypeOrmModule.forFeature([Document])],
  providers: [IngestionService, PdfExtractor, DocxExtractor, OcrExtractor],
  exports: [IngestionService],
})
export class IngestionModule {}
