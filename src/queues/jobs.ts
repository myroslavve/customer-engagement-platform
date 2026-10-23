/**
 * Job contracts shared by every producer and consumer (API modules and queue processors).
 *
 * Idempotency: every job has a deterministic jobId so re-adding the same job is a no-op while
 * the previous one is still retained. Retention is bounded by removeOnComplete/removeOnFail, so
 * consumers must also be idempotent on database state (unique run per trigger event, claim keys,
 * run.currentNodeId).
 *
 * Separator "__" is used inside jobIds (BullMQ discourages ":" in custom ids; uuids contain "-").
 */

export const JOB_PROCESS_EVENT = 'process-event';
export const JOB_EXECUTE_STEP = 'execute-step';
export const JOB_SEND_EMAIL = 'send-email';

/** Queue "events". Producers must add this job only after the events row is committed. */
export interface ProcessEventJob {
  eventId: string;
}

/** How the runner arrived at a node. The values are part of step job ids. */
export enum StepCause {
  /** Normal progression into the node (immediate or after a delay). */
  Enter = 'enter',
  /** A waiting run was resumed by `eventId` (take `next` of the wait node). */
  Event = 'event',
  /** The delayed timeout job of a wait_for_event node fired (take `timeoutNext`). */
  Timeout = 'timeout',
}

/** Queue "workflow-steps". Workflow definitions are acyclic, so (runId, nodeId, cause) is unique per run. */
export interface StepJob {
  runId: string;
  nodeId: string;
  cause: StepCause;
  eventId?: string;
}

/** Queue "email-send". References a pre-created messages row; the row is the idempotency anchor. */
export interface EmailSendJob {
  messageId: string;
}

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
