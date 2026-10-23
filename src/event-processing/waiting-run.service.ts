import { Injectable, Logger } from '@nestjs/common';
import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { NodeType } from '../enums/node-type.enum';
import { StepCause } from '../enums/step-cause.enum';
import { stepJobId } from '../queues/jobs';
import { QueueProducer } from '../queues/queue-producer';
import { StepJob } from '../types/job.types';
import { ConditionEvaluator } from '../workflows/condition-evaluator';
import { findNode } from '../workflows/find-node';
import { buildRunContext } from '../workflows/run-context';
import { RunRepository } from '../workflows/run.repository';
import { WorkflowRepository } from '../workflows/workflow.repository';

@Injectable()
export class WaitingRunService {
  private readonly logger = new Logger(WaitingRunService.name);

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly runRepository: RunRepository,
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly queueProducer: QueueProducer,
  ) {}

  /** Resumes runs of this profile that wait for this event name and whose wait filter passes. */
  async resumeWaitingRuns(event: UserEvent, profile: Profile): Promise<void> {
    const candidates = await this.runRepository.findWaiting(
      event.accountId,
      profile.id,
      event.name,
      event.id,
    );
    const ctx = buildRunContext(profile, event);

    for (const run of candidates) {
      if (!run.currentNodeId) continue;
      const version = await this.workflowRepository.getVersion(run.workflowVersionId);
      const node = findNode(version.definition, run.currentNodeId);
      if (!node || node.type !== NodeType.WaitForEvent || node.eventName !== event.name) continue;
      if (node.filter && !this.conditionEvaluator.evaluate(node.filter, ctx)) continue;

      const job: StepJob = {
        runId: run.id,
        nodeId: node.id,
        cause: StepCause.Event,
        eventId: event.id,
      };
      const claimed = await this.runRepository.claim(run.id, node.id, stepJobId(job));
      if (!claimed) {
        this.logger.debug({
          message: 'Run not claimed: already continued',
          runId: run.id,
          eventId: event.id,
        });
        continue;
      }
      await this.queueProducer.enqueueStep(job);
    }
  }
}
