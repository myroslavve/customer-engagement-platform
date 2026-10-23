import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../src/database/entities/account.entity';
import { Profile } from '../src/database/entities/profile.entity';
import { RunStep } from '../src/database/entities/run-step.entity';
import { WorkflowRun } from '../src/database/entities/workflow-run.entity';
import { ComparisonOp } from '../src/enums/comparison-op.enum';
import { NodeType } from '../src/enums/node-type.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { RunStepStatus } from '../src/enums/run-step-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { stepJobId } from '../src/queues/jobs';
import { QueueProducer } from '../src/queues/queue-producer';
import { QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../src/queues/queue-names';
import { StepJob } from '../src/types/job.types';
import { ExitNode, WorkflowDefinition, WorkflowNode } from '../src/types/workflow-definition.types';
import {
  createAccount,
  createEvent,
  createProfile,
  createRun,
  createWorkflow,
  RunOverrides,
} from './setup/fixtures';
import { getQueue, reprocessJob, waitForJobState } from './setup/queues';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

const EXIT: ExitNode = { id: 'exit', type: NodeType.Exit };
const EXIT2: ExitNode = { id: 'exit2', type: NodeType.Exit };

function definition(entryNodeId: string, nodes: WorkflowNode[]): WorkflowDefinition {
  return { trigger: { eventName: 'product_viewed' }, entryNodeId, nodes };
}

// The timeout never elapses on its own: tests that want it promote the delayed job (fireTimeout).
const WAIT_DEFINITION = definition('wait', [
  {
    id: 'wait',
    type: NodeType.WaitForEvent,
    eventName: 'purchase',
    timeoutMs: 60_000,
    next: 'exit',
    timeoutNext: 'exit2',
  },
  EXIT,
  EXIT2,
]);

type StartedRun = { run: WorkflowRun; account: Account; profile: Profile };

describe('workflow execution', () => {
  let testApp: TestApp;
  let queueProducer: QueueProducer;

  beforeAll(async () => {
    testApp = await createTestApp();
    queueProducer = testApp.get(QueueProducer);
  });
  afterAll(() => testApp.close());
  beforeEach(() => testApp.reset());

  const runs = () => testApp.dataSource.getRepository(WorkflowRun);
  const steps = (runId: string) =>
    testApp.dataSource
      .getRepository(RunStep)
      .find({ where: { runId }, order: { createdAt: 'ASC' } });
  const stepsQueue = () => getQueue(testApp.app, QUEUE_WORKFLOW_STEPS);
  const pendingStepJobs = () =>
    stepsQueue().getJobCountByTypes('waiting', 'paused', 'prioritized', 'delayed');

  /** Seeds account/profile/workflow and triggers the run through the events queue. */
  async function startRun(
    def: WorkflowDefinition,
    traits: Record<string, unknown> = {},
  ): Promise<StartedRun> {
    const account = await createAccount(testApp.dataSource);
    const profile = await createProfile(testApp.dataSource, account, { traits });
    await createWorkflow(testApp.dataSource, account, def);
    const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
    await queueProducer.enqueueProcessEvent({ eventId: event.id });
    const run = await waitFor(
      () => runs().findOneBy({ triggerEventId: event.id }),
      (found) => found !== null,
    );
    return { run: run!, account, profile };
  }

  /** Seeds a run already placed at a node, without enqueuing anything. */
  async function placeRun(def: WorkflowDefinition, overrides: RunOverrides): Promise<WorkflowRun> {
    const account = await createAccount(testApp.dataSource);
    const profile = await createProfile(testApp.dataSource, account);
    const seeded = await createWorkflow(testApp.dataSource, account, def);
    const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
    return createRun(testApp.dataSource, seeded, profile, trigger, overrides);
  }

  /** Enqueues a step job directly and waits until BullMQ settles it. */
  async function runStepJob(job: StepJob, state: 'completed' | 'failed'): Promise<void> {
    await queueProducer.enqueueStep(job);
    await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, stepJobId(job), state);
  }

  /** Makes the armed timeout job of the run's wait node due now; returns its job id. */
  async function fireTimeout(runId: string): Promise<string> {
    const jobId = stepJobId({ runId, nodeId: 'wait', cause: StepCause.Timeout });
    await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, jobId, 'delayed');
    await (await stepsQueue().getJob(jobId))!.promote();
    return jobId;
  }

  const waitForRun = (runId: string, predicate: (run: WorkflowRun) => boolean) =>
    waitFor(() => runs().findOneByOrFail({ id: runId }), predicate);
  const waitForStatus = (runId: string, status: RunStatus) =>
    waitForRun(runId, (run) => run.status === status);

  describe('node types', () => {
    it('follows the branch that matches and records every step', async () => {
      const def = definition('branch', [
        {
          id: 'branch',
          type: NodeType.Branch,
          condition: { field: 'profile.traits.plan', op: ComparisonOp.Eq, value: 'pro' },
          next: 'exit',
          elseNext: 'exit2',
        },
        EXIT,
        EXIT2,
      ]);

      const pro = await startRun(def, { plan: 'pro' });
      const completed = await waitForStatus(pro.run.id, RunStatus.Completed);
      expect(completed).toMatchObject({ currentNodeId: null, claimKey: null });
      expect(completed.finishedAt).not.toBeNull();
      expect(
        (await steps(pro.run.id)).map((s) => [s.nodeId, s.nodeType, s.cause, s.status]),
      ).toEqual([
        ['branch', NodeType.Branch, StepCause.Enter, RunStepStatus.Completed],
        ['exit', NodeType.Exit, StepCause.Enter, RunStepStatus.Completed],
      ]);

      const free = await startRun(def, { plan: 'free' });
      await waitForStatus(free.run.id, RunStatus.Completed);
      expect((await steps(free.run.id)).map((s) => s.nodeId)).toEqual(['branch', 'exit2']);
    });

    it('completes the run when a branch path leads nowhere', async () => {
      const { run } = await startRun(
        definition('branch', [
          {
            id: 'branch',
            type: NodeType.Branch,
            condition: { field: 'profile.traits.plan', op: ComparisonOp.Exists },
            next: 'exit',
            elseNext: null,
          },
          EXIT,
        ]),
      );
      await waitForStatus(run.id, RunStatus.Completed);
      expect((await steps(run.id)).map((s) => s.nodeId)).toEqual(['branch']);
    });

    it('delays the next node and records the due time', async () => {
      const { run } = await startRun(
        definition('delay', [
          { id: 'delay', type: NodeType.Delay, durationMs: 200, next: 'exit' },
          EXIT,
        ]),
      );
      const completed = await waitForStatus(run.id, RunStatus.Completed);
      const [delayStep, exitStep] = await steps(run.id);
      expect(delayStep.output).toMatchObject({ result: { nextNodeId: 'exit', delayMs: 200 } });
      expect(delayStep.output?.dueAt).toEqual(expect.any(String));
      // Both timestamps come from the database clock; without the delay they would be ms apart.
      expect(exitStep.createdAt.getTime() - delayStep.createdAt.getTime()).toBeGreaterThanOrEqual(
        150,
      );
      expect(completed.waitUntil).toBeNull();
    });
  });

  describe('wait_for_event', () => {
    it('waits for the event with a timeout armed', async () => {
      const { run } = await startRun(WAIT_DEFINITION);
      const waiting = await waitForStatus(run.id, RunStatus.Waiting);
      expect(waiting).toMatchObject({ currentNodeId: 'wait', waitingForEvent: 'purchase' });
      expect(waiting.waitUntil).not.toBeNull();
      const timeoutJobId = stepJobId({ runId: run.id, nodeId: 'wait', cause: StepCause.Timeout });
      await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, timeoutJobId, 'delayed');
      expect((await stepsQueue().getJob(timeoutJobId))?.opts.delay).toBeGreaterThan(59_000);
    });

    it('continues on the event path when the event arrives in time', async () => {
      const { run, account, profile } = await startRun(WAIT_DEFINITION);
      await waitForStatus(run.id, RunStatus.Waiting);
      const purchase = await createEvent(testApp.dataSource, account, profile, 'purchase');
      await queueProducer.enqueueProcessEvent({ eventId: purchase.id });

      const completed = await waitForStatus(run.id, RunStatus.Completed);
      expect(completed.context.lastEventId).toBe(purchase.id);
      expect((await steps(run.id)).map((s) => [s.nodeId, s.cause])).toEqual([
        ['wait', StepCause.Enter],
        ['wait', StepCause.Event],
        ['exit', StepCause.Enter],
      ]);
      // The timeout fires after the event won: it cannot claim the run, nothing is recorded for it.
      const timeoutJobId = await fireTimeout(run.id);
      await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, timeoutJobId, 'completed');
      expect(await steps(run.id)).toHaveLength(3);
    });

    it('continues on the timeout path when no event arrives', async () => {
      const { run } = await startRun(WAIT_DEFINITION);
      await waitForStatus(run.id, RunStatus.Waiting);
      await fireTimeout(run.id);
      await waitForStatus(run.id, RunStatus.Completed);
      expect((await steps(run.id)).map((s) => [s.nodeId, s.cause])).toEqual([
        ['wait', StepCause.Enter],
        ['wait', StepCause.Timeout],
        ['exit2', StepCause.Enter],
      ]);
    });

    it('completes the run from the timeout when timeoutNext is null', async () => {
      const { run } = await startRun(
        definition('wait', [
          {
            id: 'wait',
            type: NodeType.WaitForEvent,
            eventName: 'purchase',
            timeoutMs: 60_000,
            next: 'exit',
            timeoutNext: null,
          },
          EXIT,
        ]),
      );
      await waitForStatus(run.id, RunStatus.Waiting);
      await fireTimeout(run.id);
      const completed = await waitForStatus(run.id, RunStatus.Completed);
      expect(completed).toMatchObject({
        currentNodeId: null,
        waitingForEvent: null,
        waitUntil: null,
      });
      expect((await steps(run.id)).map((s) => [s.nodeId, s.cause])).toEqual([
        ['wait', StepCause.Enter],
        ['wait', StepCause.Timeout],
      ]);
    });

    it('ignores the event once the timeout has won', async () => {
      const { run, account, profile } = await startRun(WAIT_DEFINITION);
      await waitForStatus(run.id, RunStatus.Waiting);
      await fireTimeout(run.id);
      await waitForStatus(run.id, RunStatus.Completed);
      const purchase = await createEvent(testApp.dataSource, account, profile, 'purchase');
      await queueProducer.enqueueProcessEvent({ eventId: purchase.id });
      await waitForJobState(testApp.app, QUEUE_EVENTS, purchase.id, 'completed');
      expect((await steps(run.id)).some((s) => s.cause === StepCause.Event)).toBe(false);
      expect((await runs().findOneByOrFail({ id: run.id })).context.lastEventId).toBeUndefined();
    });

    it('evaluates later nodes against the event that resumed the run', async () => {
      const { run, account, profile } = await startRun(
        definition('wait', [
          {
            id: 'wait',
            type: NodeType.WaitForEvent,
            eventName: 'purchase',
            timeoutMs: 60_000,
            next: 'branch',
            timeoutNext: null,
          },
          {
            id: 'branch',
            type: NodeType.Branch,
            condition: { field: 'event.properties.amount', op: ComparisonOp.Gte, value: 100 },
            next: 'exit',
            elseNext: 'exit2',
          },
          EXIT,
          EXIT2,
        ]),
      );
      await waitForStatus(run.id, RunStatus.Waiting);
      const purchase = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 250,
      });
      await queueProducer.enqueueProcessEvent({ eventId: purchase.id });

      await waitForStatus(run.id, RunStatus.Completed);
      expect((await steps(run.id)).map((s) => s.nodeId)).toEqual([
        'wait',
        'wait',
        'branch',
        'exit',
      ]);
    });
  });

  describe('definition errors', () => {
    it('fails the run at the node whose next reference is dangling', async () => {
      const { run } = await startRun(
        definition('branch', [
          {
            id: 'branch',
            type: NodeType.Branch,
            condition: { field: 'profile.id', op: ComparisonOp.Exists },
            next: 'nope',
            elseNext: 'exit',
          },
          EXIT,
        ]),
      );
      const failed = await waitForStatus(run.id, RunStatus.Failed);
      expect(failed).toMatchObject({ currentNodeId: 'branch', claimKey: null });
      expect(failed.context.error).toContain('nope');
      expect(failed.finishedAt).not.toBeNull();
      const recorded = await steps(run.id);
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({
        nodeId: 'branch',
        nodeType: NodeType.Branch,
        status: RunStepStatus.Failed,
        output: null,
      });
      expect(recorded[0].error).toContain('nope');
      // The run is failed before the job is: wait for BullMQ to settle it.
      await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, recorded[0].jobId, 'failed');
      const job = await stepsQueue().getJob(recorded[0].jobId);
      expect(job?.attemptsMade).toBe(1);
      expect(await pendingStepJobs()).toBe(0);
    });

    it('fails the run with an untyped step when its node is missing from the definition', async () => {
      const run = await placeRun(definition('exit', [EXIT]), {
        status: RunStatus.Running,
        currentNodeId: 'ghost',
      });

      await runStepJob({ runId: run.id, nodeId: 'ghost', cause: StepCause.Enter }, 'failed');
      const failed = await waitForStatus(run.id, RunStatus.Failed);
      expect(failed.context.error).toContain('ghost');
      expect(await steps(run.id)).toMatchObject([
        { nodeId: 'ghost', nodeType: null, status: RunStepStatus.Failed },
      ]);
    });

    it('fails a step job whose run does not exist, without retries', async () => {
      const job: StepJob = { runId: randomUUID(), nodeId: 'exit', cause: StepCause.Enter };

      await runStepJob(job, 'failed');
      expect((await stepsQueue().getJob(stepJobId(job)))?.attemptsMade).toBe(1);
      expect(await testApp.dataSource.getRepository(RunStep).count()).toBe(0);
    });
  });

  describe('ownership and idempotency', () => {
    it('skips step jobs that do not own the run', async () => {
      const waiting = await placeRun(WAIT_DEFINITION, {
        status: RunStatus.Running,
        currentNodeId: 'wait',
      });
      const cancelled = await placeRun(WAIT_DEFINITION, {
        status: RunStatus.Cancelled,
        currentNodeId: 'exit',
      });

      // Stale: the run is at another node. Unclaimed event: no claim key for this job.
      await runStepJob({ runId: waiting.id, nodeId: 'exit', cause: StepCause.Enter }, 'completed');
      await runStepJob(
        { runId: waiting.id, nodeId: 'wait', cause: StepCause.Event, eventId: randomUUID() },
        'completed',
      );
      // Timeout of a run that is no longer waiting cannot claim it.
      await runStepJob(
        { runId: waiting.id, nodeId: 'wait', cause: StepCause.Timeout },
        'completed',
      );
      await runStepJob(
        { runId: cancelled.id, nodeId: 'exit', cause: StepCause.Enter },
        'completed',
      );

      expect(await testApp.dataSource.getRepository(RunStep).count()).toBe(0);
      expect(await runs().findOneByOrFail({ id: waiting.id })).toMatchObject({
        status: RunStatus.Running,
        currentNodeId: 'wait',
        claimKey: null,
      });
      expect((await runs().findOneByOrFail({ id: cancelled.id })).status).toBe(RunStatus.Cancelled);
    });

    it('does not execute a completed step again when its job is re-run', async () => {
      const { run } = await startRun(definition('exit', [EXIT]));
      const completed = await waitForStatus(run.id, RunStatus.Completed);
      const jobId = stepJobId({ runId: run.id, nodeId: 'exit', cause: StepCause.Enter });

      await reprocessJob(testApp.app, QUEUE_WORKFLOW_STEPS, jobId);
      await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, jobId, 'completed');
      expect(await steps(run.id)).toHaveLength(1);
      expect(await runs().findOneByOrFail({ id: run.id })).toMatchObject({
        status: RunStatus.Completed,
        finishedAt: completed.finishedAt,
      });
    });

    it('re-enqueues a lost follow-up on retry without restarting its delay', async () => {
      const { run } = await startRun(
        definition('delay', [
          { id: 'delay', type: NodeType.Delay, durationMs: 500, next: 'exit' },
          EXIT,
        ]),
      );
      // The follow-up is enqueued after the delay step commits: wait for the job, not the run.
      const exitJobId = stepJobId({ runId: run.id, nodeId: 'exit', cause: StepCause.Enter });
      await waitForJobState(testApp.app, QUEUE_WORKFLOW_STEPS, exitJobId, 'delayed');
      await (await stepsQueue().getJob(exitJobId))!.remove();
      const [delayStep] = await steps(run.id);
      const dueAt = new Date(delayStep.output!.dueAt!).getTime();
      await waitFor(
        async () => Date.now(),
        (now) => now > dueAt,
      );

      await reprocessJob(
        testApp.app,
        QUEUE_WORKFLOW_STEPS,
        stepJobId({ runId: run.id, nodeId: 'delay', cause: StepCause.Enter }),
      );
      await waitForStatus(run.id, RunStatus.Completed);
      expect((await steps(run.id)).map((s) => s.nodeId)).toEqual(['delay', 'exit']);
      // Past dueAt the follow-up is due at once; a restarted delay would wait another 500 ms.
      const reenqueued = await stepsQueue().getJob(exitJobId);
      expect(reenqueued).toBeDefined();
      expect(reenqueued!.opts.delay ?? 0).toBe(0);
    });
  });

  describe('transient errors', () => {
    it('leaves the run in place when they exhaust the retries, and resumes on a job retry', async () => {
      // The run's context points at an event that does not exist: loading it fails every attempt.
      const run = await placeRun(definition('exit', [EXIT]), {
        status: RunStatus.Running,
        currentNodeId: 'exit',
        context: { lastEventId: randomUUID() },
      });
      const job: StepJob = { runId: run.id, nodeId: 'exit', cause: StepCause.Enter };

      await runStepJob(job, 'failed');
      const failedJob = await stepsQueue().getJob(stepJobId(job));
      expect(failedJob?.attemptsMade).toBe(failedJob?.opts.attempts);
      expect(await runs().findOneByOrFail({ id: run.id })).toMatchObject({
        status: RunStatus.Running,
        currentNodeId: 'exit',
      });
      expect(await steps(run.id)).toHaveLength(0);

      await runs().update(run.id, { context: {} });
      await reprocessJob(testApp.app, QUEUE_WORKFLOW_STEPS, stepJobId(job));
      await waitForStatus(run.id, RunStatus.Completed);
      expect(await steps(run.id)).toMatchObject([
        { nodeId: 'exit', status: RunStepStatus.Completed },
      ]);
    });
  });
});
