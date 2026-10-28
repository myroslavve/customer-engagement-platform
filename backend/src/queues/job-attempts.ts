import { Job, UnrecoverableError } from 'bullmq';

/**
 * True when BullMQ will not run this job again: attempts exhausted or the error is unrecoverable.
 * Mirrors BullMQ's own rule (retry while attemptsMade + 1 < attempts). Not attemptsStarted: that
 * also counts runs postponed with moveToDelayed and stall restarts, which use up no attempt.
 */
export function isFinalAttempt(job: Job, error: unknown): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return attemptNumber(job) >= maxAttempts || error instanceof UnrecoverableError;
}

/** 1-based number of the attempt being processed, counted the way BullMQ counts attempts. */
export function attemptNumber(job: Job): number {
  return job.attemptsMade + 1;
}
