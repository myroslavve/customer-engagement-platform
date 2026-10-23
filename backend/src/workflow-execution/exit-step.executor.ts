import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { StepResult } from '../types/step-result.types';
import { ExitNode } from '../types/workflow-definition.types';
import { StepExecutor } from './step-executor';
import { StepExecutorRegistry } from './step-executor.registry';

@Injectable()
export class ExitStepExecutor implements StepExecutor<ExitNode> {
  readonly nodeType = NodeType.Exit;

  constructor(stepExecutorRegistry: StepExecutorRegistry) {
    stepExecutorRegistry.register(this);
  }

  async execute(): Promise<StepResult> {
    return { kind: StepResultKind.Advance, nextNodeId: null };
  }
}
