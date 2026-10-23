import { Injectable, Logger } from '@nestjs/common';
import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { RunStatus } from '../enums/run-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { QueueProducer } from '../queues/queue-producer';
import { ConditionEvaluator } from '../workflows/condition-evaluator';
import { findNode } from '../workflows/find-node';
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
      const result = await this.runRepository.createIfAbsent({
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

      if (!result) {
        this.logger.log({
          message: 'Run not started: a live run already exists',
          workflowId: version.workflowId,
          profileId: profile.id,
          eventId: event.id,
        });
        continue;
      }
      const { run, created } = result;
      if (created && run.status === RunStatus.Failed) {
        this.logger.error({
          message: 'Run not started: entry node missing from definition',
          runId: run.id,
          runContext: run.context,
        });
        continue;
      }
      // A retried job finds the run its previous attempt created. Only a run still at its entry
      // node needs the entry step (re-)enqueued; one that already moved on must not restart.
      if (run.status !== RunStatus.Running || run.currentNodeId !== entryNodeId) {
        this.logger.debug({
          message: 'Run already exists for this trigger event, nothing to enqueue',
          runId: run.id,
          status: run.status,
          currentNodeId: run.currentNodeId,
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
