import { StepCause } from '../enums/step-cause.enum';

/** Queue "events". Producers must add this job only after the events row is committed. */
export interface ProcessEventJob {
  eventId: string;
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
