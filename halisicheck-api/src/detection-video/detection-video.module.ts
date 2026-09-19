import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { DetectionImageModule } from '../detection-image/detection-image.module.js';
import { DetectionVideoService } from './detection-video.service.js';

@Module({
  imports: [MediaModule, DetectionImageModule],
  providers: [DetectionVideoService],
  exports: [DetectionVideoService],
})
export class DetectionVideoModule {}
