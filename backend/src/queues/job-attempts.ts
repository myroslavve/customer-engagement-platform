import { Job, UnrecoverableError } from 'bullmq';

/** True when BullMQ will not run this job again: attempts exhausted or the error is unrecoverable. */
export function isFinalAttempt(job: Job, error: unknown): boolean {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsStarted >= maxAttempts || error instanceof UnrecoverableError;
}
