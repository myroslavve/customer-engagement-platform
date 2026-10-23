import { RunStatus } from '../enums/run-status.enum';
import { RunState } from './run-state.types';

export type CreateRunInput = {
  accountId: string;
  workflowId: string;
  workflowVersionId: string;
  profileId: string;
  triggerEventId: string;
  status: RunStatus;
  currentNodeId: string | null;
  context: RunState;
  finishedAt: Date | null;
};
