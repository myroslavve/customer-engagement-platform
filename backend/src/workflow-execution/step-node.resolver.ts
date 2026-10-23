import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { NodeType } from '../enums/node-type.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { ResolvedStep } from '../types/resolved-step.types';
import { StepResult } from '../types/step-result.types';
import { findNode } from '../workflows/find-node';
import { WorkflowRepository } from '../workflows/workflow.repository';
import { StepExecutorRegistry } from './step-executor.registry';

/**
 * Finds the node and executor for a step. A missing node, a missing executor or a dangling
 * `next` is a definition bug: UnrecoverableError, so the run fails without retries.
 */
@Injectable()
export class StepNodeResolver {
  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly stepExecutorRegistry: StepExecutorRegistry,
  ) {}

  async resolve(run: WorkflowRun, nodeId: string): Promise<ResolvedStep> {
    const version = await this.workflowRepository.getVersion(run.workflowVersionId);
    const node = findNode(version.definition, nodeId);
    if (!node) {
      throw new UnrecoverableError(`Node "${nodeId}" not found in workflow version ${version.id}`);
    }
    const executor = this.stepExecutorRegistry.get(node.type);
    if (!executor) {
      throw new UnrecoverableError(`No executor registered for node type "${node.type}"`);
    }
    return { versionId: version.id, definition: version.definition, node, executor };
  }

  /** Fails the step that references a missing node, not a phantom step for the missing one. */
  assertNextNodeExists(step: ResolvedStep, result: StepResult): void {
    if (result.kind !== StepResultKind.Advance || result.nextNodeId === null) return;
    if (findNode(step.definition, result.nextNodeId)) return;
    throw new UnrecoverableError(
      `Next node "${result.nextNodeId}" of node "${step.node.id}" not found in workflow version ${step.versionId}`,
    );
  }

  /** For recording a failed step: null when the version or the node cannot be found. */
  async findNodeType(run: WorkflowRun, nodeId: string): Promise<NodeType | null> {
    const version = await this.workflowRepository.findById(run.workflowVersionId);
    if (!version) return null;
    return findNode(version.definition, nodeId)?.type ?? null;
  }
}
