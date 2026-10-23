import { StepExecutionContext } from '../types/step-execution-context.types';
import { StepResult } from '../types/step-result.types';
import { WorkflowNode } from '../types/workflow-definition.types';

/**
 * Executes one node visit and says what happens next. Implementations register themselves with
 * StepExecutorRegistry in their constructor. The runner persists the transition and enqueues the
 * follow-up; an executor's own side effects (send_email's message) must be idempotent per run and node.
 */
export interface StepExecutor<N extends WorkflowNode = WorkflowNode> {
  readonly nodeType: N['type'];
  execute(node: N, ctx: StepExecutionContext): Promise<StepResult>;
}
