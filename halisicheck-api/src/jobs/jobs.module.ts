import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from './entities/job.entity.js';
import { JobsController } from './jobs.controller.js';
import { JobsProcessor } from './jobs.processor.js';
import { ANALYSIS_QUEUE, JobsService } from './jobs.service.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { DetectionTextModule } from '../detection-text/detection-text.module.js';
import { DetectionImageModule } from '../detection-image/detection-image.module.js';
import { DetectionVideoModule } from '../detection-video/detection-video.module.js';
import { MediaModule } from '../media/media.module.js';
import { RewriteModule } from '../rewrite/rewrite.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Job]),
    // The controller's JWT guards resolve AuthModuleOptions from here.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
    IngestionModule,
    DetectionTextModule,
    DetectionImageModule,
    DetectionVideoModule,
    MediaModule,
    RewriteModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor],
  exports: [JobsService],
})
export class JobsModule {}
