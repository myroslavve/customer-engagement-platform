import { Injectable } from '@nestjs/common';
import { NodeType } from '../enums/node-type.enum';
import { StepExecutor } from './step-executor';

/** Node type → executor. Filled during provider construction, before any BullMQ worker starts. */
@Injectable()
export class StepExecutorRegistry {
  private readonly executors = new Map<NodeType, StepExecutor>();

  /** Throws on a second executor for the same node type, which would otherwise shadow the first. */
  register(executor: StepExecutor): void {
    if (this.executors.has(executor.nodeType)) {
      throw new Error(`An executor for node type "${executor.nodeType}" is already registered`);
    }
    this.executors.set(executor.nodeType, executor);
  }

  get(nodeType: NodeType): StepExecutor | undefined {
    return this.executors.get(nodeType);
  }
}
