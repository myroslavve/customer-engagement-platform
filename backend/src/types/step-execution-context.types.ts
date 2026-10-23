import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { StepCause } from '../enums/step-cause.enum';
import { RunContext } from './run-context.types';

export type StepExecutionContext = {
  run: WorkflowRun;
  cause: StepCause;
  runContext: RunContext;
};
