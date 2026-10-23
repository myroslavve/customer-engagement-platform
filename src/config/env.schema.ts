import { z } from 'zod';

const redisUrlSchema = z
  .string()
  .url()
  .transform((value) => {
    const url = new URL(value);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
    };
  });

/**
 * Environment contract, validated by ConfigModule on boot. Values are read back through
 * ConfigService<Env, true> with { infer: true }, so the inferred output types (after defaults and
 * transforms) are what the code sees.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  /** Parsed into ioredis connection options. */
  REDIS_URL: redisUrlSchema.default('redis://localhost:6379'),
  WORKER_EVENTS_CONCURRENCY: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export type Env = z.infer<typeof envSchema>;
