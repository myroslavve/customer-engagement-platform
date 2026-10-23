import { NodeType } from '../enums/node-type.enum';
import { RunStepStatus } from '../enums/run-step-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { RunStepOutput } from './run-step-output.types';

export type CreateRunStepInput = {
  runId: string;
  jobId: string;
  nodeId: string;
  /** null when the node could not be resolved (failed steps only). */
  nodeType: NodeType | null;
  cause: StepCause;
  status: RunStepStatus;
  output: RunStepOutput | null;
  error: string | null;
};
