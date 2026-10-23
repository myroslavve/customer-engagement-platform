import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { parseConfig } from './parse-config';

export const QueueConfigSchema = z.object({
  eventsConcurrency: z.coerce.number().int().positive().default(10),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

export const queueConfig = registerAs('queue', (): QueueConfig =>
  parseConfig('queue', QueueConfigSchema, {
    eventsConcurrency: process.env.EVENTS_QUEUE_CONCURRENCY,
  }),
);
