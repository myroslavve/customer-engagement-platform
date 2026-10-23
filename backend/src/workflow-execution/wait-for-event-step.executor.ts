import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepCause } from '../enums/step-cause.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { StepExecutionContext } from '../types/step-execution-context.types';
import { StepResult } from '../types/step-result.types';
import { WaitForEventNode } from '../types/workflow-definition.types';
import { StepExecutor } from './step-executor';
import { StepExecutorRegistry } from './step-executor.registry';

/**
 * Entering the node starts the wait (the runner persists `waiting` and schedules the timeout job).
 * The node is visited again with cause `event` (WaitingRunService claimed the run) or `timeout`
 * (the runner claimed it); only one of the two can happen.
 */
@Injectable()
export class WaitForEventStepExecutor implements StepExecutor<WaitForEventNode> {
  readonly nodeType = NodeType.WaitForEvent;

  constructor(stepExecutorRegistry: StepExecutorRegistry) {
    stepExecutorRegistry.register(this);
  }

  async execute(node: WaitForEventNode, ctx: StepExecutionContext): Promise<StepResult> {
    switch (ctx.cause) {
      case StepCause.Enter:
        return { kind: StepResultKind.Wait, eventName: node.eventName, timeoutMs: node.timeoutMs };
      case StepCause.Event:
        return { kind: StepResultKind.Advance, nextNodeId: node.next };
      case StepCause.Timeout:
        return { kind: StepResultKind.Advance, nextNodeId: node.timeoutNext };
    }
  }
}
