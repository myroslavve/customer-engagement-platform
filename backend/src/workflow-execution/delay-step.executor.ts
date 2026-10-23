import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { StepResult } from '../types/step-result.types';
import { DelayNode } from '../types/workflow-definition.types';
import { StepExecutor } from './step-executor';
import { StepExecutorRegistry } from './step-executor.registry';

@Injectable()
export class DelayStepExecutor implements StepExecutor<DelayNode> {
  readonly nodeType = NodeType.Delay;

  constructor(stepExecutorRegistry: StepExecutorRegistry) {
    stepExecutorRegistry.register(this);
  }

  async execute(node: DelayNode): Promise<StepResult> {
    return { kind: StepResultKind.Advance, nextNodeId: node.next, delayMs: node.durationMs };
  }
}
