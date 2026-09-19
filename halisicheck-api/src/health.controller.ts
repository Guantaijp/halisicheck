import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SkipThrottle } from '@nestjs/throttler';
import { MistralService } from './mistral/mistral.service.js';
import type { AppConfig } from './config/configuration.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  env: string;
  checks: Record<string, { ok: boolean; detail: string }>;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mistral: MistralService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Reports which capabilities are actually available.
   *
   * Deliberately distinguishes "down" from "not configured": running without a
   * Mistral key is a supported state with reduced function, not a fault, and
   * conflating the two makes a missing key look like an outage.
   */
  @Get()
  // The throttlers are named, so a bare @SkipThrottle() would look for one
  // called "default" and skip nothing. Health is polled by load balancers and
  // uptime monitors, which must never be rate-limited.
  @SkipThrottle({ short: true, long: true })
  @ApiOperation({ summary: 'Service and dependency health' })
  async check(): Promise<HealthResponse> {
    const checks: HealthResponse['checks'] = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { ok: true, detail: 'Connected.' };
    } catch (error) {
      checks.database = { ok: false, detail: (error as Error).message };
    }

    checks.mistral = this.mistral.isConfigured
      ? { ok: true, detail: `Configured (${this.mistral.textModel} / ${this.mistral.visionModel}).` }
      : {
          ok: false,
          detail:
            'MISTRAL_API_KEY not set. Ingestion, queuing and image metadata still work; the LLM judge, rewrites and image/video classification do not.',
        };

    const video = this.config.getOrThrow<AppConfig['video']>('video');
    checks.ffmpeg = {
      ok: true,
      detail: `Configured as "${video.ffmpegPath}" / "${video.ffprobePath}". Video jobs fail with a clear error if these are not runnable.`,
    };

    return {
      // The database is the only hard dependency for the service to be useful.
      status: checks.database.ok ? 'ok' : 'degraded',
      env: this.config.getOrThrow<string>('env'),
      checks,
    };
  }
}
