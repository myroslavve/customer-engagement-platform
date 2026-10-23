import { Injectable, Logger } from '@nestjs/common';
import { stepJobId } from '../queues/jobs';
import { StepJob } from '../types/job.types';
import { RunStepRepository } from '../workflows/run-step.repository';
import { RunRepository } from '../workflows/run.repository';
import { FollowUpScheduler } from './follow-up.scheduler';
import { toStepOutput } from './run-transition';
import { StepContextBuilder } from './step-context.builder';
import { StepNodeResolver } from './step-node.resolver';
import { StepOwnershipService } from './step-ownership.service';
import { StepRecorder } from './step-recorder';

/**
 * Executes one node visit per step job: "execute the node once, then make sure the follow-up job
 * exists". run_steps.job_id makes the first half idempotent, deterministic job ids the second.
 * Throws UnrecoverableError for definition bugs (the processor then calls fail); any other error
 * is transient and is retried by BullMQ without touching the run.
 */
@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);

  constructor(
    private readonly runRepository: RunRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly stepOwnershipService: StepOwnershipService,
    private readonly stepNodeResolver: StepNodeResolver,
    private readonly stepContextBuilder: StepContextBuilder,
    private readonly stepRecorder: StepRecorder,
    private readonly followUpScheduler: FollowUpScheduler,
  ) {}

  async run(job: StepJob): Promise<void> {
    const jobId = stepJobId(job);
    const recordedStep = await this.runStepRepository.findByJobId(jobId);
    if (recordedStep) {
      // A retry after the follow-up enqueue failed: only the enqueue is repeated.
      await this.followUpScheduler.schedule(recordedStep);
      return;
    }

    const run = await this.stepOwnershipService.findOwnedRun(job, jobId);
    if (!run) return;

    const step = await this.stepNodeResolver.resolve(run, job.nodeId);
    const runContext = await this.stepContextBuilder.build(run, job);
    const result = await step.executor.execute(step.node, { run, cause: job.cause, runContext });
    this.stepNodeResolver.assertNextNodeExists(step, result);

    const output = toStepOutput(result, new Date());
    const completedStep = await this.stepRecorder.recordCompleted(run, job, step.node, output);
    await this.followUpScheduler.schedule(completedStep);
  }

  /** Records a failed step and fails the run; called for UnrecoverableError only. */
  async fail(job: StepJob, error: Error): Promise<void> {
    const run = await this.runRepository.findById(job.runId);
    if (!run) return;
    const nodeType = await this.stepNodeResolver.findNodeType(run, job.nodeId);
    const failed = await this.stepRecorder.recordFailed(run, job, nodeType, error);

    // The processor already logged the error with its stack; this records the outcome.
    if (failed) {
      this.logger.log({ message: 'Run marked failed', runId: run.id, nodeId: job.nodeId });
      return;
    }
    this.logger.warn({
      message: 'Run already moved on, failure not recorded',
      runId: run.id,
      nodeId: job.nodeId,
      status: run.status,
    });
  }
}
