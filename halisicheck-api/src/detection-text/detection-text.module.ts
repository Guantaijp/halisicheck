import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DetectionResult } from './entities/detection-result.entity.js';
import { DetectionSpan } from './entities/detection-span.entity.js';
import { DetectionTextService } from './detection-text.service.js';
import { LlmJudgeService } from './llm-judge/llm-judge.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DetectionResult, DetectionSpan])],
  providers: [DetectionTextService, LlmJudgeService],
  exports: [DetectionTextService],
})
export class DetectionTextModule {}
