import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAsset } from './entities/media-asset.entity.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset])],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
