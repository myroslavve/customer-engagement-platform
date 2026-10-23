import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { StepExecutionContext } from '../types/step-execution-context.types';
import { StepResult } from '../types/step-result.types';
import { BranchNode } from '../types/workflow-definition.types';
import { ConditionEvaluator } from '../workflows/condition-evaluator';
import { StepExecutor } from './step-executor';
import { StepExecutorRegistry } from './step-executor.registry';

@Injectable()
export class BranchStepExecutor implements StepExecutor<BranchNode> {
  readonly nodeType = NodeType.Branch;

  constructor(
    private readonly conditionEvaluator: ConditionEvaluator,
    stepExecutorRegistry: StepExecutorRegistry,
  ) {
    stepExecutorRegistry.register(this);
  }

  async execute(node: BranchNode, ctx: StepExecutionContext): Promise<StepResult> {
    const matched = this.conditionEvaluator.evaluate(node.condition, ctx.runContext);
    return { kind: StepResultKind.Advance, nextNodeId: matched ? node.next : node.elseNext };
  }
}
