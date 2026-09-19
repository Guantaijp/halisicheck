import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rewrite } from './entities/rewrite.entity.js';
import { DetectionSpan } from '../detection-text/entities/detection-span.entity.js';
import { RewriteService } from './rewrite.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Rewrite, DetectionSpan])],
  providers: [RewriteService],
  exports: [RewriteService],
})
export class RewriteModule {}
