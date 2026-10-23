import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { RunStatus } from '../enums/run-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { StepJob } from '../types/job.types';
import { RunRepository } from '../workflows/run.repository';

/**
 * Decides whether a step job may execute its node. Stale jobs (the run moved on) and the loser of
 * the wait race (event vs timeout) are skipped; only one of them can own a waiting run.
 */
@Injectable()
export class StepOwnershipService {
  private readonly logger = new Logger(StepOwnershipService.name);

  constructor(private readonly runRepository: RunRepository) {}

  /** The run when this job owns it, null when the job must be skipped. */
  async findOwnedRun(job: StepJob, jobId: string): Promise<WorkflowRun | null> {
    const run = await this.runRepository.findById(job.runId);
    if (!run) throw new UnrecoverableError(`Run ${job.runId} not found`);

    if (!(await this.owns(run, job, jobId))) {
      this.logger.debug({
        message: 'Step job skipped: it does not own the run',
        jobId,
        runId: run.id,
        status: run.status,
        currentNodeId: run.currentNodeId,
      });
      return null;
    }
    // claim() changed the row; reload so the transition works on current state.
    return job.cause === StepCause.Timeout ? this.runRepository.findByIdOrFail(run.id) : run;
  }

  /**
   * enter: the run is running at the node. event: same, and WaitingRunService claimed it for this
   * job. timeout: the job claims the waiting run itself.
   */
  private async owns(run: WorkflowRun, job: StepJob, jobId: string): Promise<boolean> {
    if (job.cause === StepCause.Timeout) {
      return this.runRepository.claim(run.id, job.nodeId, jobId);
    }
    const atNode = run.status === RunStatus.Running && run.currentNodeId === job.nodeId;
    if (job.cause === StepCause.Event) return atNode && run.claimKey === jobId;
    return atNode;
  }
}
