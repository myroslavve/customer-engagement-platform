import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { parseConfig } from './parse-config';

/** Shape matches ioredis connection options, so BullMQ takes it as is. */
export const RedisConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.coerce.number().int().positive().default(6379),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  db: z.coerce.number().int().min(0).default(0),
});

export type RedisConfig = z.infer<typeof RedisConfigSchema>;

export const redisConfig = registerAs('redis', (): RedisConfig =>
  parseConfig('redis', RedisConfigSchema, {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
  }),
);
