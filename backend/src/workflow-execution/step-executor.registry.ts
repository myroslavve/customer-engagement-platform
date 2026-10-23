import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepExecutor } from './step-executor';

/** Node type → executor. Filled during provider construction, before any BullMQ worker starts. */
@Injectable()
export class StepExecutorRegistry {
  private readonly executors = new Map<NodeType, StepExecutor>();

  register(executor: StepExecutor): void {
    this.executors.set(executor.nodeType, executor);
  }

  get(nodeType: NodeType): StepExecutor | undefined {
    return this.executors.get(nodeType);
  }
}
