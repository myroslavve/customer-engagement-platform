import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { AppConfig } from '../config/configuration';
import { attemptNumber, isFinalAttempt } from '../queues/job-attempts';
import { QUEUE_WORKFLOW_STEPS } from '../queues/queue-names';
import { StepJob } from '../types/job.types';
import { WorkflowRunner } from './workflow-runner';

@Processor(QUEUE_WORKFLOW_STEPS)
export class StepsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(StepsProcessor.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly workflowRunner: WorkflowRunner,
  ) {
    super();
  }

  /** The BullMQ worker is created by @nestjs/bullmq during module init; concurrency is set after. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.configService.get('queue', { infer: true }).stepsConcurrency;
    this.logger.log({
      message: 'Consuming queue',
      queue: QUEUE_WORKFLOW_STEPS,
      concurrency: this.worker.concurrency,
    });
  }

  /**
   * Transient errors are retried by BullMQ and, once exhausted, leave the run where it is (the job
   * stays in the failed set and can be retried). Only UnrecoverableError fails the run; if failing
   * it errors, that error is thrown instead so BullMQ retries and the retry fails the run again.
   */
  async process(job: Job<StepJob, void, string>): Promise<void> {
    try {
      await this.workflowRunner.run(job.data);
    } catch (error) {
      if (error instanceof UnrecoverableError) await this.failRun(job, error);
      this.logAttemptFailed(job, error);
      throw error;
    }
  }

  private async failRun(job: Job<StepJob, void, string>, error: UnrecoverableError): Promise<void> {
    try {
      await this.workflowRunner.fail(job.data, error);
    } catch (failError) {
      const message = isFinalAttempt(job, failError)
        ? 'Failing the run failed, run left at its node'
        : 'Failing the run failed, will retry';
      this.logger.error(
        { ...this.jobDetails(job, failError), message, unrecoverableError: error.message },
        failError instanceof Error ? failError.stack : undefined,
      );
      throw failError;
    }
  }

  /** Retried attempts log at warn; only the last one (or an unrecoverable error) at error. */
  private logAttemptFailed(job: Job<StepJob, void, string>, error: unknown): void {
    if (!isFinalAttempt(job, error)) {
      this.logger.warn({
        ...this.jobDetails(job, error),
        message: 'execute-step attempt failed, will retry',
      });
      return;
    }
    this.logger.error(
      { ...this.jobDetails(job, error), message: 'execute-step failed' },
      error instanceof Error ? error.stack : undefined,
    );
  }

  private jobDetails(job: Job<StepJob, void, string>, error: unknown) {
    return {
      jobId: job.id,
      runId: job.data.runId,
      nodeId: job.data.nodeId,
      cause: job.data.cause,
      attempt: attemptNumber(job),
      maxAttempts: job.opts.attempts ?? 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
