import { Injectable, Logger } from '@nestjs/common';
import { RunStep } from '../database/entities/run-step.entity';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { NodeType } from '../enums/node-type.enum';
import { RunStepStatus } from '../enums/run-step-status.enum';
import { stepJobId } from '../queues/jobs';
import { CreateRunStepInput } from '../types/create-run-step-input.types';
import { StepJob } from '../types/job.types';
import { RunStepOutput } from '../types/run-step-output.types';
import { WorkflowNode } from '../types/workflow-definition.types';
import { RunStepRepository } from '../workflows/run-step.repository';
import { RunRepository } from '../workflows/run.repository';
import { applyStepOutput } from './run-transition';

/**
 * Persists step outcomes: the run_steps row and the run update in one transaction. The row goes
 * first, so a duplicate job blocks on uq_run_steps_job_id and never touches the run.
 */
@Injectable()
export class StepRecorder {
  private readonly logger = new Logger(StepRecorder.name);

  constructor(
    private readonly runRepository: RunRepository,
    private readonly runStepRepository: RunStepRepository,
  ) {}

  /** The recorded step; the one a duplicate job committed first when it won the race. */
  async recordCompleted(
    run: WorkflowRun,
    job: StepJob,
    node: WorkflowNode,
    output: RunStepOutput,
  ): Promise<RunStep> {
    try {
      return await this.insertCompleted(run, job, node, output);
    } catch (error) {
      return this.findCommittedDuplicate(stepJobId(job), error);
    }
  }

  /**
   * Fails the run and records the failed step. False when the run already moved on (a duplicate
   * whose twin advanced or failed it); nothing is recorded then.
   */
  recordFailed(
    run: WorkflowRun,
    job: StepJob,
    nodeType: NodeType | null,
    error: Error,
  ): Promise<boolean> {
    return this.runRepository.transaction(async (transaction) => {
      const marked = await this.runRepository.markFailed(
        run.id,
        job.nodeId,
        error.message,
        transaction,
      );
      if (!marked) return false;
      const input = this.stepInput(job, nodeType, RunStepStatus.Failed, null, error.message);
      await this.runStepRepository.createIfAbsent(input, transaction);
      return true;
    });
  }

  private insertCompleted(
    run: WorkflowRun,
    job: StepJob,
    node: WorkflowNode,
    output: RunStepOutput,
  ): Promise<RunStep> {
    const input = this.stepInput(job, node.type, RunStepStatus.Completed, output, null);
    return this.runRepository.transaction(async (transaction) => {
      const step = await this.runStepRepository.create(input, transaction);
      applyStepOutput(run, job, output, new Date());
      await this.runRepository.save(run, transaction);
      return step;
    });
  }

  /** Rethrows anything but the job_id conflict of a duplicate that already committed this step. */
  private async findCommittedDuplicate(jobId: string, error: unknown): Promise<RunStep> {
    if (!this.runStepRepository.isJobIdConflict(error)) throw error;
    const committed = await this.runStepRepository.findByJobId(jobId);
    if (!committed) throw error;
    this.logger.debug({ message: 'Step already recorded by a duplicate job', jobId });
    return committed;
  }

  private stepInput(
    job: StepJob,
    nodeType: NodeType | null,
    status: RunStepStatus,
    output: RunStepOutput | null,
    error: string | null,
  ): CreateRunStepInput {
    return {
      runId: job.runId,
      jobId: stepJobId(job),
      nodeId: job.nodeId,
      nodeType,
      cause: job.cause,
      status,
      output,
      error,
    };
  }
}
