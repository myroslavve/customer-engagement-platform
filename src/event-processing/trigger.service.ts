import { Injectable, Logger } from '@nestjs/common';
import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { RunStatus } from '../database/entities/workflow-run.entity';
import { StepCause } from '../queues/jobs';
import { QueueProducer } from '../queues/queue-producer';
import { ConditionEvaluator } from '../workflows/condition-evaluator';
import { findNode } from '../workflows/definition';
import { buildRunContext } from '../workflows/run-context';
import { RunRepository } from '../workflows/run.repository';
import { WorkflowRepository } from '../workflows/workflow.repository';

@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly queueProducer: QueueProducer,
  ) {}

  /** Starts a run for every active workflow triggered by this event whose entry filter passes. */
  async startMatchingRuns(event: UserEvent, profile: Profile): Promise<void> {
    const versions = await this.workflowRepository.findActiveByTrigger(event.accountId, event.name);
    const ctx = buildRunContext(profile, event);

    for (const version of versions) {
      const { trigger, entryNodeId } = version.definition;
      if (trigger.filter && !this.conditionEvaluator.evaluate(trigger.filter, ctx)) continue;

      const entryNode = findNode(version.definition, entryNodeId);
      const run = await this.runRepository.createIfAbsent({
        accountId: event.accountId,
        workflowId: version.workflowId,
        workflowVersionId: version.id,
        profileId: profile.id,
        triggerEventId: event.id,
        status: entryNode ? RunStatus.Running : RunStatus.Failed,
        currentNodeId: entryNode ? entryNodeId : null,
        context: entryNode ? {} : { error: `Entry node "${entryNodeId}" not found in definition` },
        finishedAt: entryNode ? null : new Date(),
      });

      if (!run) {
        this.logger.log('Run not started: a live run already exists', {
          workflowId: version.workflowId,
          profileId: profile.id,
          eventId: event.id,
        });
        continue;
      }
      if (run.status !== RunStatus.Running) {
        this.logger.error('Run not started: created in a terminal status', {
          runId: run.id,
          status: run.status,
          context: run.context,
        });
        continue;
      }
      await this.queueProducer.enqueueStep({
        runId: run.id,
        nodeId: entryNodeId,
        cause: StepCause.Enter,
      });
    }
  }
}
