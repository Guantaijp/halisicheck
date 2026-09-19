import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('port');
  const env = config.getOrThrow<string>('env');

  // The global ValidationPipe is registered in AppModule via APP_PIPE so it
  // applies to every construction of the app, not just this bootstrap path.

  // CORS is left open in development for local frontend work and must be
  // pinned to known origins in production.
  const origins = process.env.HALISI_CORS_ORIGINS;
  app.enableCors({
    origin: origins ? origins.split(',').map((o) => o.trim()) : env !== 'production',
    credentials: true,
    // Without this the browser hides Content-Disposition from JavaScript, so
    // a download falls back to a generic filename instead of the one the API
    // chose. Cross-origin responses expose only a short safelist by default.
    exposedHeaders: ['Content-Disposition'],
  });

  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('HalisiCheck API')
    .setDescription(
      'AI content detection and rewrite. Detection results are likelihoods with confidence intervals, never verdicts; rewrites are suggestions that require human acceptance.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  const mistralConfigured = Boolean(process.env.MISTRAL_API_KEY);
  logger.log(`HalisiCheck API listening on http://localhost:${port} (${env})`);
  logger.log(`API documentation at http://localhost:${port}/docs`);
  if (!mistralConfigured) {
    logger.warn(
      'MISTRAL_API_KEY is not set. The service will run, but the LLM judge, rewrites and image/video classification are unavailable. See GET /health.',
    );
  }
}

await bootstrap();
