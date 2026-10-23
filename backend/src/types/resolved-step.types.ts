import type { StepExecutor } from '../workflow-execution/step-executor';
import { WorkflowDefinition, WorkflowNode } from './workflow-definition.types';

/** The node a step job names, the definition it belongs to and the executor for its type. */
export type ResolvedStep = {
  versionId: string;
  definition: WorkflowDefinition;
  node: WorkflowNode;
  executor: StepExecutor;
};
