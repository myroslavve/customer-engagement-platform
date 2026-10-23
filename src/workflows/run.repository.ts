import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { RunStatus, WorkflowRun } from '../database/entities/workflow-run.entity';

export interface CreateRunInput {
  accountId: string;
  workflowId: string;
  workflowVersionId: string;
  profileId: string;
  triggerEventId: string;
  status: RunStatus;
  currentNodeId: string | null;
  context: Record<string, unknown>;
  finishedAt: Date | null;
}

@Injectable()
export class RunRepository {
  constructor(@InjectRepository(WorkflowRun) private readonly runs: Repository<WorkflowRun>) {}

  /**
   * INSERT ... ON CONFLICT DO NOTHING, then SELECT by (workflowVersionId, triggerEventId).
   * Returns the run for this trigger event (fresh or pre-existing), or null when the conflict was
   * the live-run-per-profile index (another run of this workflow is live for the profile).
   */
  async createIfAbsent(input: CreateRunInput): Promise<WorkflowRun | null> {
    await this.runs
      .createQueryBuilder()
      .insert()
      .into(WorkflowRun)
      // QueryDeepPartialEntity cannot map Record<string, unknown> jsonb columns; the shape is exact.
      .values(input as QueryDeepPartialEntity<WorkflowRun>)
      .orIgnore()
      .execute();
    return this.runs.findOne({
      where: { workflowVersionId: input.workflowVersionId, triggerEventId: input.triggerEventId },
    });
  }

  async findById(runId: string): Promise<WorkflowRun> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Workflow run ${runId} not found`);
    return run;
  }

  /**
   * Runs of the profile that this event may resume: waiting for eventName, or already claimed by
   * this very event on a previous attempt (claim key ends with "__event__<eventId>").
   */
  async findWaiting(
    accountId: string,
    profileId: string,
    eventName: string,
    eventId: string,
  ): Promise<WorkflowRun[]> {
    const live = await this.runs.find({
      where: { accountId, profileId, status: In([RunStatus.Waiting, RunStatus.Running]) },
    });
    const claimSuffix = `__event__${eventId}`;
    return live.filter(
      (run) =>
        (run.status === RunStatus.Waiting && run.waitingForEvent === eventName) ||
        (run.status === RunStatus.Running &&
          run.claimKey !== null &&
          run.claimKey.endsWith(claimSuffix)),
    );
  }

  /**
   * Atomic conditional update: only one of "event arrived" / "timeout" can continue a waiting run.
   * The claimKey arm lets a retried job re-win its own claim after a failed enqueue.
   */
  async claim(runId: string, nodeId: string, claimKey: string): Promise<boolean> {
    const result = await this.runs
      .createQueryBuilder()
      .update(WorkflowRun)
      .set({ status: RunStatus.Running, claimKey, updatedAt: () => 'now()' })
      .where(
        'id = :runId AND current_node_id = :nodeId AND (status = :waiting OR claim_key = :claimKey)',
        { runId, nodeId, waiting: RunStatus.Waiting, claimKey },
      )
      .execute();
    return result.affected === 1;
  }

  async save(run: WorkflowRun): Promise<void> {
    run.updatedAt = new Date();
    await this.runs.save(run);
  }
}
