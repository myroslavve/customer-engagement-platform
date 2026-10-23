import { z } from 'zod';

/** Shape matches ioredis connection options, so BullMQ takes it as is. */
export const RedisConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.coerce.number().int().positive().default(6379),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  db: z.coerce.number().int().min(0).default(0),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;

export function redisConfig(): RedisConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return RedisConfigSchema.parse({
    host: process.env.REDIS_HOST || undefined,
    port: process.env.REDIS_PORT || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || undefined,
  });
}
