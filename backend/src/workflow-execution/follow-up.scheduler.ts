import { Injectable } from '@nestjs/common';
import { RunStep } from '../database/entities/run-step.entity';
import { RunStepStatus } from '../enums/run-step-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { QueueProducer } from '../queues/queue-producer';
import { StepJob } from '../types/job.types';

/**
 * Enqueues the job that follows a completed step: the next node, or the timeout of a wait.
 * Idempotent by job id; the delay is the time left until dueAt, so retries do not restart it.
 */
@Injectable()
export class FollowUpScheduler {
  constructor(private readonly queueProducer: QueueProducer) {}

  async schedule(step: RunStep): Promise<void> {
    const followUp = this.followUpJob(step);
    if (!followUp) return;
    await this.queueProducer.enqueueStep(followUp, this.remainingDelayMs(step));
  }

  /** null for failed steps and for the step that completed the run. */
  private followUpJob(step: RunStep): StepJob | null {
    if (step.status !== RunStepStatus.Completed || !step.output) return null;
    const { result } = step.output;
    if (result.kind === StepResultKind.Wait) {
      return { runId: step.runId, nodeId: step.nodeId, cause: StepCause.Timeout };
    }
    if (result.nextNodeId === null) return null;
    return { runId: step.runId, nodeId: result.nextNodeId, cause: StepCause.Enter };
  }

  private remainingDelayMs(step: RunStep): number {
    const dueAt = step.output?.dueAt;
    if (!dueAt) return 0;
    return Math.max(0, new Date(dueAt).getTime() - Date.now());
  }
}
