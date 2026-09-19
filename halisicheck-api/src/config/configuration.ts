/**
 * Central environment contract. Every value the app reads from the environment
 * is declared here and nowhere else, so a missing variable surfaces at boot
 * rather than halfway through a job.
 *
 * App-level variables are prefixed HALISI_; third-party credentials keep the
 * name the vendor documents.
 */

export type StorageDriver = 'local' | 's3';

export interface AppConfig {
  env: string;
  port: number;
  /** Public base URL, used in Swagger and returned links. */
  baseUrl: string;
  database: {
    url: string;
    /** Never true outside development — migrations own the schema. */
    synchronize: boolean;
    logging: boolean;
  };
  redis: {
    url: string;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
  };
  mistral: {
    apiKey: string;
    /** Text judging and rewriting. */
    textModel: string;
    /** Image and video-frame assessment (must be a vision-capable model). */
    visionModel: string;
    /** Hard ceiling on characters sent to the LLM in one call. */
    maxInputChars: number;
  };
  storage: {
    driver: StorageDriver;
    /** Root directory when driver is 'local'. */
    localRoot: string;
    maxUploadBytes: number;
  };
  video: {
    /** Absolute path to ffmpeg/ffprobe, or bare name to resolve from PATH. */
    ffmpegPath: string;
    ffprobePath: string;
    /** Seconds between sampled frames. */
    frameIntervalSeconds: number;
    /** Cap on frames per clip — cost and latency control. */
    maxFrames: number;
  };
  detection: {
    /** Score at or above which a span is surfaced for review. */
    reviewThreshold: number;
    /** Below this, a span is not flagged at all. */
    noticeThreshold: number;
  };
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`);
  }
  return parsed;
}

export default (): AppConfig => {
  const env = process.env.NODE_ENV ?? 'development';

  return {
    env,
    port: int('PORT', 3000),
    baseUrl: process.env.HALISI_BASE_URL ?? `http://localhost:${int('PORT', 3000)}`,
    database: {
      url: required(
        'DATABASE_URL',
        'postgres://halisi:halisi@localhost:5433/halisicheck',
      ),
      // Schema is owned by migrations in every environment. Synchronize is a
      // foot-gun that silently drops columns, so it stays off.
      synchronize: false,
      logging: process.env.HALISI_DB_LOGGING === 'true',
    },
    redis: {
      url: required('REDIS_URL', 'redis://localhost:6380'),
    },
    auth: {
      // Dev-only fallback: a fixed secret is fine locally, fatal in production,
      // which is why production has no fallback at all.
      jwtSecret:
        env === 'production'
          ? required('HALISI_JWT_SECRET')
          : required('HALISI_JWT_SECRET', 'dev-only-insecure-secret'),
      jwtExpiresIn: process.env.HALISI_JWT_EXPIRES_IN ?? '7d',
    },
    mistral: {
      // Not required at boot: the API still serves ingestion, jobs and
      // metadata-only media checks without it. Calls that need it fail with a
      // clear message instead of the whole service refusing to start.
      apiKey: process.env.MISTRAL_API_KEY ?? '',
      // Defaults verified against a live key. `mistral-large-latest` is
      // refused with 403 tier_not_allowed on lower tiers, and medium/small
      // return 429 there, so the default is the model that actually works;
      // raise it on a tier that allows more.
      textModel: process.env.HALISI_MISTRAL_TEXT_MODEL ?? 'ministral-8b-latest',
      // Must be vision-capable. ministral-8b accepts image_url chunks;
      // pixtral is not available on every tier.
      visionModel: process.env.HALISI_MISTRAL_VISION_MODEL ?? 'ministral-8b-latest',
      maxInputChars: int('HALISI_MISTRAL_MAX_INPUT_CHARS', 24000),
    },
    storage: {
      driver: (process.env.STORAGE_DRIVER ?? 'local') as StorageDriver,
      localRoot: process.env.HALISI_STORAGE_ROOT ?? './storage',
      maxUploadBytes: int('HALISI_MAX_UPLOAD_BYTES', 100 * 1024 * 1024),
    },
    video: {
      ffmpegPath: process.env.HALISI_FFMPEG_PATH ?? 'ffmpeg',
      ffprobePath: process.env.HALISI_FFPROBE_PATH ?? 'ffprobe',
      frameIntervalSeconds: int('HALISI_FRAME_INTERVAL_SECONDS', 2),
      maxFrames: int('HALISI_MAX_FRAMES', 25),
    },
    detection: {
      reviewThreshold: int('HALISI_REVIEW_THRESHOLD', 70),
      noticeThreshold: int('HALISI_NOTICE_THRESHOLD', 40),
    },
  };
};
