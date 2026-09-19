import { Global, Module } from '@nestjs/common';
import { MistralService } from './mistral.service.js';

/**
 * Global because four unrelated modules (text judge, rewrite, image, video)
 * all need the same configured client.
 */
@Global()
@Module({
  providers: [MistralService],
  exports: [MistralService],
})
export class MistralModule {}
