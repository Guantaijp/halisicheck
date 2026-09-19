import { BullModule } from '@nestjs/bullmq';
import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration, { type AppConfig } from './config/configuration.js';
import { buildTypeOrmOptions } from './config/database.config.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

import { MistralModule } from './mistral/mistral.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { DetectionTextModule } from './detection-text/detection-text.module.js';
import { DetectionImageModule } from './detection-image/detection-image.module.js';
import { DetectionVideoModule } from './detection-video/detection-video.module.js';
import { RewriteModule } from './rewrite/rewrite.module.js';
import { MediaModule } from './media/media.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.getOrThrow<AppConfig['redis']>('redis').url);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            // BullMQ requires this; without it a stalled job can retry forever.
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    // Heavy jobs are already queued; this stops a caller from filling the
    // queue faster than it drains.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 5 },
      { name: 'long', ttl: 60_000, limit: 60 },
    ]),

    MistralModule,
    UsersModule,
    AuthModule,
    IngestionModule,
    DetectionTextModule,
    DetectionImageModule,
    DetectionVideoModule,
    RewriteModule,
    MediaModule,
    JobsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      // Registered here rather than in bootstrap() so the same validation
      // applies wherever the app graph is constructed, tests included.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        // Strip unknown properties and reject them outright, so a typo in a
        // client payload fails loudly instead of being silently ignored.
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
