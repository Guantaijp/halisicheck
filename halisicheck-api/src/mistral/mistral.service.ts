import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';
import type { AppConfig } from '../config/configuration.js';
import { extractJson, flattenContent } from './json-extract.util.js';

export interface JsonCallOptions {
  system: string;
  user: string;
  /** Override the configured text model (e.g. to use the vision model). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Fixed seed keeps repeated analyses of the same text comparable. */
  seed?: number;
  /** Base64 data URIs to attach as image content chunks. */
  images?: string[];
}

/**
 * Thin wrapper over the Mistral SDK. Everything that talks to an LLM goes
 * through here so that model choice, JSON handling, truncation and failure
 * behaviour are decided in exactly one place.
 */
@Injectable()
export class MistralService {
  private readonly logger = new Logger(MistralService.name);
  private client: Mistral | null = null;

  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_RETRY_MS = 1500;
  private readonly cfg: AppConfig['mistral'];

  constructor(private readonly config: ConfigService) {
    this.cfg = this.config.getOrThrow<AppConfig['mistral']>('mistral');
  }

  get isConfigured(): boolean {
    return this.cfg.apiKey.length > 0;
  }

  get textModel(): string {
    return this.cfg.textModel;
  }

  get visionModel(): string {
    return this.cfg.visionModel;
  }

  private getClient(): Mistral {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException(
        'MISTRAL_API_KEY is not set. Text judging, rewriting and image scoring are unavailable until it is.',
      );
    }
    this.client ??= new Mistral({ apiKey: this.cfg.apiKey });
    return this.client;
  }

  /** Truncates on a word boundary so the model never sees a severed token. */
  truncate(text: string): { text: string; truncated: boolean } {
    if (text.length <= this.cfg.maxInputChars) return { text, truncated: false };
    const slice = text.slice(0, this.cfg.maxInputChars);
    const lastSpace = slice.lastIndexOf(' ');
    return {
      text: lastSpace > 0 ? slice.slice(0, lastSpace) : slice,
      truncated: true,
    };
  }

  /**
   * Calls the model in JSON mode and parses the result. Returns null rather
   * than throwing when the model answers with unparseable output — callers
   * degrade to their statistical signals instead of failing the whole job.
   */
  async completeJson<T>(options: JsonCallOptions): Promise<T | null> {
    const raw = await this.completeRaw(options);
    if (raw === null) return null;
    return this.parseJson<T>(raw);
  }

  /** Returns the model's message content as a plain string. */
  async completeRaw(options: JsonCallOptions): Promise<string | null> {
    const client = this.getClient();
    const model = options.model ?? this.cfg.textModel;

    const userContent = options.images?.length
      ? [
          { type: 'text' as const, text: options.user },
          ...options.images.map((url) => ({
            type: 'image_url' as const,
            imageUrl: { url },
          })),
        ]
      : options.user;

    // Rate limits are a live constraint on lower tiers, and a video job makes
    // one call per sampled frame. Retrying 429 and 5xx with backoff turns a
    // burst into a slower job rather than a lost signal; 4xx other than 429 is
    // a request problem that retrying cannot fix.
    for (let attempt = 0; attempt <= MistralService.MAX_RETRIES; attempt++) {
      try {
        const response = await client.chat.complete({
          model,
          temperature: options.temperature ?? 0.1,
          maxTokens: options.maxTokens ?? 2048,
          randomSeed: options.seed ?? 7,
          responseFormat: { type: 'json_object' },
          messages: [
            { role: 'system', content: options.system },
            { role: 'user', content: userContent },
          ],
        });

        return this.flattenContent(response.choices?.[0]?.message?.content);
      } catch (error) {
        const message = (error as Error).message;
        const retryable = /Status (429|5\d\d)/.test(message);

        if (!retryable || attempt === MistralService.MAX_RETRIES) {
          // A model failure degrades one signal; it must not sink the job.
          this.logger.error(
            `Mistral call failed (model=${model}, attempt ${attempt + 1}): ${message.split('\n')[0]}`,
          );
          return null;
        }

        const delay = MistralService.BASE_RETRY_MS * 2 ** attempt;
        this.logger.warn(
          `Mistral rate-limited or unavailable (model=${model}); retrying in ${delay}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /** Message content is `string | ContentChunk[] | null` — normalise it. */
  private flattenContent(content: unknown): string | null {
    return flattenContent(content);
  }

  /**
   * JSON mode is not a guarantee in practice, so parsing is tolerant of
   * fences and surrounding prose. See json-extract.util.ts.
   */
  private parseJson<T>(raw: string): T | null {
    const parsed = extractJson<T>(raw);
    if (parsed === null) {
      this.logger.warn(`Could not parse model output as JSON: ${raw.slice(0, 200)}`);
    }
    return parsed;
  }
}
