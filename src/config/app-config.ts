import { z } from 'zod';

export type LogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  WORKER_EVENTS_CONCURRENCY: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export interface RedisConnectionConfig {
  host: string;
  port: number;
  password?: string;
}

export class AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly databaseUrl: string;
  readonly redis: RedisConnectionConfig;
  readonly workerEventsConcurrency: number;
  readonly logLevel: LogLevel;

  private constructor(env: z.infer<typeof envSchema>) {
    const redisUrl = new URL(env.REDIS_URL);
    this.nodeEnv = env.NODE_ENV;
    this.databaseUrl = env.DATABASE_URL;
    this.redis = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      password: redisUrl.password || undefined,
    };
    this.workerEventsConcurrency = env.WORKER_EVENTS_CONCURRENCY;
    this.logLevel = env.LOG_LEVEL;
  }

  /** Parses and validates process.env; throws a readable error listing every invalid variable. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const result = envSchema.safeParse(env);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment: ${issues}`);
    }
    return new AppConfig(result.data);
  }
}
