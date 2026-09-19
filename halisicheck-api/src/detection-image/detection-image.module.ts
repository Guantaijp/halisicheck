import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { DetectionImageService } from './detection-image.service.js';
import { ClassifierClientService } from './classifier-client.service.js';

@Module({
  imports: [MediaModule],
  providers: [DetectionImageService, ClassifierClientService],
  exports: [DetectionImageService, ClassifierClientService],
})
export class DetectionImageModule {}
