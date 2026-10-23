import { z } from 'zod';

export const QueueConfigSchema = z.object({
  eventsConcurrency: z.coerce.number().int().positive().default(10),
  stepsConcurrency: z.coerce.number().int().positive().default(10),
  /** BullMQ attempts per job (all queues). */
  jobAttempts: z.coerce.number().int().positive().default(5),
  /** Base delay of the exponential backoff between attempts. */
  backoffDelayMs: z.coerce.number().int().positive().default(1000),
});

export type QueueConfig = z.infer<typeof QueueConfigSchema>;

export function queueConfig(): QueueConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return QueueConfigSchema.parse({
    eventsConcurrency: process.env.EVENTS_QUEUE_CONCURRENCY || undefined,
    stepsConcurrency: process.env.STEPS_QUEUE_CONCURRENCY || undefined,
    jobAttempts: process.env.QUEUE_JOB_ATTEMPTS || undefined,
    backoffDelayMs: process.env.QUEUE_BACKOFF_DELAY_MS || undefined,
  });
}
