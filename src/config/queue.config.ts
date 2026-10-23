import { z } from 'zod';

export const QueueConfigSchema = z.object({
  eventsConcurrency: z.coerce.number().int().positive().default(10),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

export function queueConfig(): QueueConfig {
  return QueueConfigSchema.parse({
    eventsConcurrency: process.env.EVENTS_QUEUE_CONCURRENCY,
  });
}
