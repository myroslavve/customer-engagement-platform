import { z } from 'zod';

export const QueueConfigSchema = z.object({
  eventsConcurrency: z.coerce.number().int().positive().default(10),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

export function queueConfig(): QueueConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return QueueConfigSchema.parse({
    eventsConcurrency: process.env.EVENTS_QUEUE_CONCURRENCY || undefined,
  });
}
