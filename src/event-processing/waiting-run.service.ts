import { Injectable, Logger } from '@nestjs/common';
import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { stepJobId } from '../queues/jobs';
import { QueueProducer } from '../queues/queue-producer';
import { ConditionEvaluator } from '../workflows/condition-evaluator';
import { findNode } from '../workflows/definition';
import { buildRunContext } from '../workflows/run-context';
import { RunRepository } from '../workflows/run.repository';
import { WorkflowRepository } from '../workflows/workflow.repository';

@Injectable()
export class WaitingRunService {
  private readonly logger = new Logger(WaitingRunService.name);

  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly runs: RunRepository,
    private readonly conditions: ConditionEvaluator,
    private readonly producer: QueueProducer,
  ) {}

  /** Resumes runs of this profile that wait for this event name and whose wait filter passes. */
  async resumeWaitingRuns(event: UserEvent, profile: Profile): Promise<void> {
    const candidates = await this.runs.findWaiting(
      event.accountId,
      profile.id,
      event.name,
      event.id,
    );
    const ctx = buildRunContext(profile, event);

    for (const run of candidates) {
      if (!run.currentNodeId) continue;
      const version = await this.workflows.getVersion(run.workflowVersionId);
      const node = findNode(version.definition, run.currentNodeId);
      if (!node || node.type !== 'wait_for_event' || node.eventName !== event.name) continue;
      if (node.filter && !this.conditions.evaluate(node.filter, ctx)) continue;

      const job = { runId: run.id, nodeId: node.id, cause: 'event' as const, eventId: event.id };
      const claimed = await this.runs.claim(run.id, node.id, stepJobId(job));
      if (!claimed) {
        this.logger.debug(`Run ${run.id} not claimed for event ${event.id}: already continued`);
        continue;
      }
      await this.producer.enqueueStep(job);
    }
  }
}
