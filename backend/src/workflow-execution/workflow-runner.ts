import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { RunStep } from '../database/entities/run-step.entity';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { RunStatus } from '../enums/run-status.enum';
import { RunStepStatus } from '../enums/run-step-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { stepJobId } from '../queues/jobs';
import { QueueProducer } from '../queues/queue-producer';
import { StepJob } from '../types/job.types';
import { RunContext } from '../types/run-context.types';
import { RunStepOutput } from '../types/run-step-output.types';
import { StepResult } from '../types/step-result.types';
import { EventRepository } from '../workflows/event.repository';
import { findNode } from '../workflows/find-node';
import { ProfileRepository } from '../workflows/profile.repository';
import { buildRunContext } from '../workflows/run-context';
import { RunStepRepository } from '../workflows/run-step.repository';
import { RunRepository } from '../workflows/run.repository';
import { WorkflowRepository } from '../workflows/workflow.repository';
import { StepExecutorRegistry } from './step-executor.registry';

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
    private readonly workflowRepository: WorkflowRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly eventRepository: EventRepository,
    private readonly stepExecutorRegistry: StepExecutorRegistry,
    private readonly queueProducer: QueueProducer,
  ) {}

  async run(job: StepJob): Promise<void> {
    const jobId = stepJobId(job);
    const existingStep = await this.runStepRepository.findByJobId(jobId);
    if (existingStep) {
      // A retry after the follow-up enqueue failed: only the enqueue is repeated.
      if (existingStep.status === RunStepStatus.Completed) await this.enqueueFollowUp(existingStep);
      return;
    }

    const run = await this.loadOwnedRun(job, jobId);
    if (!run) return;

    const version = await this.workflowRepository.getVersion(run.workflowVersionId);
    const node = findNode(version.definition, job.nodeId);
    if (!node) {
      throw new UnrecoverableError(
        `Node "${job.nodeId}" not found in workflow version ${version.id}`,
      );
    }
    const executor = this.stepExecutorRegistry.get(node.type);
    if (!executor) {
      throw new UnrecoverableError(`No executor registered for node type "${node.type}"`);
    }

    const runContext = await this.buildContext(run, job);
    const result = await executor.execute(node, { run, cause: job.cause, runContext });
    if (
      result.kind === StepResultKind.Advance &&
      result.nextNodeId !== null &&
      !findNode(version.definition, result.nextNodeId)
    ) {
      throw new UnrecoverableError(
        `Next node "${result.nextNodeId}" of node "${node.id}" not found in workflow version ${version.id}`,
      );
    }

    const output = this.toOutput(result);
    const step = await this.runRepository.transaction(async (transaction) => {
      const created = await this.runStepRepository.create(
        {
          runId: run.id,
          jobId,
          nodeId: node.id,
          nodeType: node.type,
          cause: job.cause,
          status: RunStepStatus.Completed,
          output,
          error: null,
        },
        transaction,
      );
      this.applyOutput(run, job, output);
      await this.runRepository.save(run, transaction);
      return created;
    });
    await this.enqueueFollowUp(step);
  }

  /** Records a failed step and fails the run; called for UnrecoverableError only. */
  async fail(job: StepJob, error: Error): Promise<void> {
    const run = await this.runRepository.findById(job.runId);
    if (!run) return;
    const version = await this.workflowRepository.findById(run.workflowVersionId);
    const nodeType = version ? (findNode(version.definition, job.nodeId)?.type ?? null) : null;
    await this.runRepository.transaction(async (transaction) => {
      await this.runStepRepository.createIfAbsent(
        {
          runId: run.id,
          jobId: stepJobId(job),
          nodeId: job.nodeId,
          nodeType,
          cause: job.cause,
          status: RunStepStatus.Failed,
          output: null,
          error: error.message,
        },
        transaction,
      );
      await this.runRepository.markFailed(run.id, job.nodeId, error.message, transaction);
    });
    this.logger.error({
      message: 'Run failed',
      runId: run.id,
      nodeId: job.nodeId,
      error: error.message,
    });
  }

  /**
   * Returns the run when this job is the one allowed to execute the node, null when the job is
   * stale (the run moved on) or lost the wait race. Timeout jobs win by claiming the run.
   */
  private async loadOwnedRun(job: StepJob, jobId: string): Promise<WorkflowRun | null> {
    const run = await this.runRepository.findById(job.runId);
    if (!run) throw new UnrecoverableError(`Run ${job.runId} not found`);

    let owned = false;
    switch (job.cause) {
      case StepCause.Timeout:
        owned = await this.runRepository.claim(run.id, job.nodeId, jobId);
        break;
      case StepCause.Event:
        owned =
          run.status === RunStatus.Running &&
          run.currentNodeId === job.nodeId &&
          run.claimKey === jobId;
        break;
      case StepCause.Enter:
        owned = run.status === RunStatus.Running && run.currentNodeId === job.nodeId;
        break;
    }
    if (!owned) {
      this.logger.debug({
        message: 'Step job skipped: it does not own the run',
        jobId,
        runId: run.id,
        status: run.status,
        currentNodeId: run.currentNodeId,
      });
      return null;
    }
    // claim() changed the row; reload so applyOutput works on current state.
    return job.cause === StepCause.Timeout ? this.runRepository.findByIdOrFail(run.id) : run;
  }

  /** The event in context is the one that last touched the run; the trigger event otherwise. */
  private async buildContext(run: WorkflowRun, job: StepJob): Promise<RunContext> {
    const profile = await this.profileRepository.findByIdOrFail(run.profileId);
    const eventId =
      (job.cause === StepCause.Event && job.eventId) ||
      run.context.lastEventId ||
      run.triggerEventId;
    const event = await this.eventRepository.findByIdOrFail(eventId);
    return buildRunContext(profile, event);
  }

  private toOutput(result: StepResult): RunStepOutput {
    const delayMs = result.kind === StepResultKind.Wait ? result.timeoutMs : result.delayMs;
    const dueAt = delayMs !== undefined ? new Date(Date.now() + delayMs).toISOString() : null;
    return { result, dueAt };
  }

  private applyOutput(run: WorkflowRun, job: StepJob, output: RunStepOutput): void {
    const { result, dueAt } = output;
    run.claimKey = null;
    run.waitUntil = dueAt ? new Date(dueAt) : null;
    if (result.kind === StepResultKind.Wait) {
      run.status = RunStatus.Waiting;
      run.waitingForEvent = result.eventName;
      return;
    }
    run.waitingForEvent = null;
    if (job.cause === StepCause.Event && job.eventId) {
      run.context = { ...run.context, lastEventId: job.eventId };
    }
    if (result.nextNodeId === null) {
      run.status = RunStatus.Completed;
      run.currentNodeId = null;
      run.finishedAt = new Date();
    } else {
      run.currentNodeId = result.nextNodeId;
    }
  }

  /** Idempotent by job id; the delay is the time left until dueAt, so retries do not restart it. */
  private async enqueueFollowUp(step: RunStep): Promise<void> {
    const output = step.output;
    if (!output) return;
    const delayMs = output.dueAt ? Math.max(0, new Date(output.dueAt).getTime() - Date.now()) : 0;
    if (output.result.kind === StepResultKind.Wait) {
      await this.queueProducer.enqueueStep(
        { runId: step.runId, nodeId: step.nodeId, cause: StepCause.Timeout },
        delayMs,
      );
    } else if (output.result.nextNodeId !== null) {
      await this.queueProducer.enqueueStep(
        { runId: step.runId, nodeId: output.result.nextNodeId, cause: StepCause.Enter },
        delayMs,
      );
    }
  }
}
