import { RunStatus } from '../enums/run-status.enum';

export type CreateRunInput = {
  accountId: string;
  workflowId: string;
  workflowVersionId: string;
  profileId: string;
  triggerEventId: string;
  status: RunStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;
  finishedAt: Date | null;
};
