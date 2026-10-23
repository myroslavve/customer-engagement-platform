/**
 * Job names and job ids shared by every producer and consumer (API modules and queue processors).
 * Payload types live in types/job.types.ts.
 *
 * Idempotency: every job has a deterministic jobId so re-adding the same job is a no-op while
 * the previous one is still retained. Retention is bounded by removeOnComplete/removeOnFail, so
 * consumers must also be idempotent on database state (unique run per trigger event, claim keys,
 * run.currentNodeId).
 *
 * Separator "__" is used inside jobIds (BullMQ discourages ":" in custom ids; uuids contain "-").
 */

import { StepCause } from '../enums/step-cause.enum';
import { EmailSendJob, ProcessEventJob, StepJob } from '../types/job.types';

export const JOB_PROCESS_EVENT = 'process-event';
export const JOB_EXECUTE_STEP = 'execute-step';
export const JOB_SEND_EMAIL = 'send-email';

export function processEventJobId(job: ProcessEventJob): string {
  return job.eventId;
}

export function stepJobId(job: StepJob): string {
  const base = `${job.runId}__${job.nodeId}__${job.cause}`;
  return job.cause === StepCause.Event && job.eventId ? `${base}__${job.eventId}` : base;
}

export function emailSendJobId(job: EmailSendJob): string {
  return job.messageId;
}
