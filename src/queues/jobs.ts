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

const SEPARATOR = '__';

export function processEventJobId(job: ProcessEventJob): string {
  return job.eventId;
}

export function stepJobId(job: StepJob): string {
  const runNode = job.runId + SEPARATOR + job.nodeId;
  return job.cause === StepCause.Event && job.eventId
    ? runNode + eventClaimSuffix(job.eventId)
    : runNode + SEPARATOR + job.cause;
}

/** The tail of every step job id (and claim key) produced by resuming a run with this event. */
export function eventClaimSuffix(eventId: string): string {
  return SEPARATOR + StepCause.Event + SEPARATOR + eventId;
}

export function emailSendJobId(job: EmailSendJob): string {
  return job.messageId;
}
