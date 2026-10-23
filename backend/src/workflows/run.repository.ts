import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AbstractRepository } from '../database/abstract.repository';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { RunStatus } from '../enums/run-status.enum';
import { eventClaimSuffix } from '../queues/jobs';
import { CreateRunInput } from '../types/create-run-input.types';
import { CreateRunResult } from '../types/create-run-result.types';
import { Transaction } from '../types/transaction.types';

@Injectable()
export class RunRepository extends AbstractRepository<WorkflowRun> {
  constructor(@InjectRepository(WorkflowRun) workflowRunRepository: Repository<WorkflowRun>) {
    super(workflowRunRepository);
  }

  /**
   * INSERT ... ON CONFLICT DO NOTHING RETURNING id, then SELECT by (workflowVersionId, triggerEventId).
   * Returns the run for this trigger event with created = whether this call inserted it, or null
   * when the conflict was the live-run-per-profile index (another run of this workflow is live).
   */
  async createIfAbsent(
    input: CreateRunInput,
    transaction?: Transaction,
  ): Promise<CreateRunResult | null> {
    const insertResult = await this.getRepository(transaction)
      .createQueryBuilder()
      .insert()
      .into(WorkflowRun)
      // QueryDeepPartialEntity cannot map Record<string, unknown> jsonb columns; the shape is exact.
      .values(input as QueryDeepPartialEntity<WorkflowRun>)
      .orIgnore()
      .returning('id')
      .execute();
    const run = await this.findOne(
      {
        where: { workflowVersionId: input.workflowVersionId, triggerEventId: input.triggerEventId },
      },
      transaction,
    );
    return run ? { run, created: (insertResult.raw as unknown[]).length > 0 } : null;
  }

  /**
   * Runs of the profile that this event may resume: waiting for eventName, or already claimed by
   * this very event on a previous attempt (claim key ends with eventClaimSuffix(eventId)).
   */
  async findWaiting(
    accountId: string,
    profileId: string,
    eventName: string,
    eventId: string,
    transaction?: Transaction,
  ): Promise<WorkflowRun[]> {
    const liveRuns = await this.find(
      { where: { accountId, profileId, status: In([RunStatus.Waiting, RunStatus.Running]) } },
      transaction,
    );
    const claimSuffix = eventClaimSuffix(eventId);
    return liveRuns.filter(
      (run) =>
        (run.status === RunStatus.Waiting && run.waitingForEvent === eventName) ||
        (run.status === RunStatus.Running &&
          run.claimKey !== null &&
          run.claimKey.endsWith(claimSuffix)),
    );
  }

  /**
   * Atomic conditional update: only one of "event arrived" / "timeout" can continue a waiting run.
   * The claimKey arm lets a retried job re-win its own claim after a failed enqueue; it is limited to
   * running runs, so it can never revive a completed, failed or cancelled one. The run stops
   * waiting, so the wait columns are cleared.
   */
  async claim(
    runId: string,
    nodeId: string,
    claimKey: string,
    transaction?: Transaction,
  ): Promise<boolean> {
    const result = await this.getRepository(transaction)
      .createQueryBuilder()
      .update(WorkflowRun)
      .set({ status: RunStatus.Running, claimKey, waitingForEvent: null, waitUntil: null })
      .where(
        'id = :runId AND current_node_id = :nodeId' +
          ' AND (status = :waiting OR (status = :running AND claim_key = :claimKey))',
        { runId, nodeId, waiting: RunStatus.Waiting, running: RunStatus.Running, claimKey },
      )
      .execute();
    return result.affected === 1;
  }
}
