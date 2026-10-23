import { WorkflowRun } from '../database/entities/workflow-run.entity';

/** The run for a trigger event; created is false when a previous attempt already inserted it. */
export type CreateRunResult = {
  run: WorkflowRun;
  created: boolean;
};
