import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EventOutbox } from '../src/database/entities/event-outbox.entity';
import { WorkflowRun } from '../src/database/entities/workflow-run.entity';
import { ComparisonOp } from '../src/enums/comparison-op.enum';
import { NodeType } from '../src/enums/node-type.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { WorkflowStatus } from '../src/enums/workflow-status.enum';
import { OutboxService } from '../src/ingestion/outbox.service';
import { stepJobId } from '../src/queues/jobs';
import { QueueProducer } from '../src/queues/queue-producer';
import { QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../src/queues/queue-names';
import { WorkflowDefinition } from '../src/types/workflow-definition.types';
import {
  createAccount,
  createEvent,
  createProfile,
  createRun,
  createWorkflow,
} from './setup/fixtures';
import { getQueue, reprocessJob, waitForJobState } from './setup/queues';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

const WAIT_DEFINITION: WorkflowDefinition = {
  trigger: { eventName: 'product_viewed' },
  entryNodeId: 'wait',
  nodes: [
    {
      id: 'wait',
      type: NodeType.WaitForEvent,
      eventName: 'purchase',
      filter: { field: 'event.properties.amount', op: ComparisonOp.Gte, value: 100 },
      timeoutMs: 60_000,
      next: 'exit',
      timeoutNext: 'exit',
    },
    { id: 'exit', type: NodeType.Exit },
  ],
};

const WAIT_UNTIL = new Date(Date.now() + 60_000);

describe('events processing', () => {
  let testApp: TestApp;
  let queueProducer: QueueProducer;

  beforeAll(async () => {
    testApp = await createTestApp();
    queueProducer = testApp.get(QueueProducer);
    // Assert what EventsProcessor leaves behind before the runner moves runs on.
    await testApp.pauseQueue(QUEUE_WORKFLOW_STEPS);
  });
  afterAll(async () => {
    testApp.resumeQueue(QUEUE_WORKFLOW_STEPS);
    await testApp.close();
  });
  beforeEach(() => testApp.reset());

  const runs = () => testApp.dataSource.getRepository(WorkflowRun);
  const stepsQueue = () => getQueue(testApp.app, QUEUE_WORKFLOW_STEPS);
  /** Step jobs not yet taken by the (paused) steps worker. */
  const pendingStepJobs = () =>
    stepsQueue().getJobCountByTypes('waiting', 'paused', 'prioritized', 'delayed');
  const processEvent = async (eventId: string, state: 'completed' | 'failed' = 'completed') => {
    await queueProducer.enqueueProcessEvent({ eventId });
    await waitForJobState(testApp.app, QUEUE_EVENTS, eventId, state);
  };

  /** Account, profile and an active workflow with WAIT_DEFINITION (or the given one). */
  async function seed(definition: WorkflowDefinition = WAIT_DEFINITION) {
    const account = await createAccount(testApp.dataSource);
    const profile = await createProfile(testApp.dataSource, account, { traits: { plan: 'free' } });
    const seeded = await createWorkflow(testApp.dataSource, account, definition);
    return { account, profile, seeded };
  }

  describe('trigger', () => {
    it('starts one run per trigger event and enqueues the entry step, idempotently', async () => {
      const { account, profile } = await seed();
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(event.id);
      const [run] = await runs().find();
      expect(run).toMatchObject({
        status: RunStatus.Running,
        currentNodeId: 'wait',
        triggerEventId: event.id,
      });
      const entryJobId = stepJobId({ runId: run.id, nodeId: 'wait', cause: StepCause.Enter });
      expect(await stepsQueue().getJob(entryJobId)).toBeDefined();

      await reprocessJob(testApp.app, QUEUE_EVENTS, event.id);
      await waitForJobState(testApp.app, QUEUE_EVENTS, event.id, 'completed');
      expect(await runs().count()).toBe(1);
      expect(await pendingStepJobs()).toBe(1);
    });

    it('re-enqueues a lost entry step on retry, but not once the run moved on', async () => {
      const { account, profile } = await seed();
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      await processEvent(event.id);
      const [run] = await runs().find();
      const entryJobId = stepJobId({ runId: run.id, nodeId: 'wait', cause: StepCause.Enter });

      await (await stepsQueue().getJob(entryJobId))!.remove();
      await reprocessJob(testApp.app, QUEUE_EVENTS, event.id);
      await waitForJobState(testApp.app, QUEUE_EVENTS, event.id, 'completed');
      expect(await stepsQueue().getJob(entryJobId)).toBeDefined();

      await (await stepsQueue().getJob(entryJobId))!.remove();
      await runs().update(run.id, { currentNodeId: 'exit' });
      await reprocessJob(testApp.app, QUEUE_EVENTS, event.id);
      await waitForJobState(testApp.app, QUEUE_EVENTS, event.id, 'completed');
      expect(await pendingStepJobs()).toBe(0);
      expect(await runs().count()).toBe(1);
    });

    it('starts a run for every matching workflow of the account', async () => {
      const { account, profile } = await seed();
      await createWorkflow(testApp.dataSource, account, WAIT_DEFINITION);
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(event.id);
      expect(await runs().countBy({ triggerEventId: event.id })).toBe(2);
      expect(await pendingStepJobs()).toBe(2);
    });

    it('does not start a run when the entry filter rejects the event', async () => {
      const { account, profile } = await seed({
        ...WAIT_DEFINITION,
        trigger: {
          eventName: 'product_viewed',
          filter: { field: 'profile.traits.plan', op: ComparisonOp.Eq, value: 'pro' },
        },
      });
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(event.id);
      expect(await runs().count()).toBe(0);
    });

    it('ignores workflows that are not active, of another account or of another trigger', async () => {
      const { account, profile } = await seed({
        ...WAIT_DEFINITION,
        trigger: { eventName: 'signed_up' },
      });
      await createWorkflow(testApp.dataSource, account, WAIT_DEFINITION, WorkflowStatus.Paused);
      await createWorkflow(testApp.dataSource, account, WAIT_DEFINITION, WorkflowStatus.Draft);
      await createWorkflow(
        testApp.dataSource,
        await createAccount(testApp.dataSource),
        WAIT_DEFINITION,
      );
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(event.id);
      expect(await runs().count()).toBe(0);
    });

    it('starts no second run while one is live for the profile and workflow', async () => {
      const { account, profile } = await seed();
      const first = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const second = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(first.id);
      await processEvent(second.id);
      const all = await runs().find();
      expect(all).toHaveLength(1);
      expect(all[0].triggerEventId).toBe(first.id);
      expect(await pendingStepJobs()).toBe(1);
    });

    it('starts a new run once the previous one finished', async () => {
      const { account, profile, seeded } = await seed();
      const first = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      await createRun(testApp.dataSource, seeded, profile, first, {
        status: RunStatus.Completed,
        currentNodeId: null,
      });
      const second = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(second.id);
      expect(await runs().findOneBy({ triggerEventId: second.id })).toMatchObject({
        status: RunStatus.Running,
        currentNodeId: 'wait',
      });
    });

    it('records a failed run without a step when the entry node is missing', async () => {
      const { account, profile } = await seed({ ...WAIT_DEFINITION, entryNodeId: 'nope' });
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');

      await processEvent(event.id);
      const [run] = await runs().find();
      expect(run).toMatchObject({ status: RunStatus.Failed, currentNodeId: null });
      expect(run.context.error).toContain('nope');
      expect(run.finishedAt).not.toBeNull();
      expect(await pendingStepJobs()).toBe(0);
    });
  });

  describe('waiting runs', () => {
    it('resumes a waiting run only with an awaited event that passes the wait filter', async () => {
      const { account, profile, seeded } = await seed();
      const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const run = await createRun(testApp.dataSource, seeded, profile, trigger, {
        status: RunStatus.Waiting,
        currentNodeId: 'wait',
        waitingForEvent: 'purchase',
        waitUntil: WAIT_UNTIL,
      });

      const small = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 10,
      });
      await processEvent(small.id);
      const other = await createEvent(testApp.dataSource, account, profile, 'refund', {
        amount: 250,
      });
      await processEvent(other.id);
      expect(await runs().findOneByOrFail({ id: run.id })).toMatchObject({
        status: RunStatus.Waiting,
        claimKey: null,
        waitUntil: WAIT_UNTIL,
      });
      expect(await pendingStepJobs()).toBe(0);

      const big = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 250,
      });
      await processEvent(big.id);
      const expectedJobId = stepJobId({
        runId: run.id,
        nodeId: 'wait',
        cause: StepCause.Event,
        eventId: big.id,
      });
      expect(await runs().findOneByOrFail({ id: run.id })).toMatchObject({
        status: RunStatus.Running,
        claimKey: expectedJobId,
        waitingForEvent: null,
        waitUntil: null,
      });
      expect(await stepsQueue().getJob(expectedJobId)).toBeDefined();
    });

    it("does not resume another profile's waiting run", async () => {
      const { account, profile, seeded } = await seed();
      const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const run = await createRun(testApp.dataSource, seeded, profile, trigger, {
        status: RunStatus.Waiting,
        currentNodeId: 'wait',
        waitingForEvent: 'purchase',
        waitUntil: WAIT_UNTIL,
      });
      const stranger = await createProfile(testApp.dataSource, account);
      const purchase = await createEvent(testApp.dataSource, account, stranger, 'purchase', {
        amount: 250,
      });

      await processEvent(purchase.id);
      expect(await runs().findOneByOrFail({ id: run.id })).toMatchObject({
        status: RunStatus.Waiting,
        waitUntil: WAIT_UNTIL,
      });
      expect(await pendingStepJobs()).toBe(0);
    });

    it('re-wins its own claim and re-enqueues the step when retried after a lost enqueue', async () => {
      const { account, profile, seeded } = await seed();
      const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const purchase = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 250,
      });
      const run = await createRun(testApp.dataSource, seeded, profile, trigger, {
        status: RunStatus.Running,
        currentNodeId: 'wait',
      });
      const expectedJobId = stepJobId({
        runId: run.id,
        nodeId: 'wait',
        cause: StepCause.Event,
        eventId: purchase.id,
      });
      await runs().update(run.id, { claimKey: expectedJobId });

      await processEvent(purchase.id);
      expect(await stepsQueue().getJob(expectedJobId)).toBeDefined();
      expect((await runs().findOneByOrFail({ id: run.id })).claimKey).toBe(expectedJobId);
    });

    it('does not resume a run another event already claimed', async () => {
      const { account, profile, seeded } = await seed();
      const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const first = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 250,
      });
      const run = await createRun(testApp.dataSource, seeded, profile, trigger, {
        status: RunStatus.Running,
        currentNodeId: 'wait',
      });
      const claimKey = stepJobId({
        runId: run.id,
        nodeId: 'wait',
        cause: StepCause.Event,
        eventId: first.id,
      });
      await runs().update(run.id, { claimKey });
      const second = await createEvent(testApp.dataSource, account, profile, 'purchase', {
        amount: 250,
      });

      await processEvent(second.id);
      expect(await pendingStepJobs()).toBe(0);
      expect((await runs().findOneByOrFail({ id: run.id })).claimKey).toBe(claimKey);
    });
  });

  describe('outbox', () => {
    it('publishes a stored event whose job never reached the queue, then drops the row', async () => {
      const { account, profile } = await seed();
      const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      await testApp.dataSource.getRepository(EventOutbox).save({ eventId: event.id });

      await testApp.get(OutboxService).publishPending();
      await waitForJobState(testApp.app, QUEUE_EVENTS, event.id, 'completed');
      expect(await runs().countBy({ triggerEventId: event.id })).toBe(1);
      // The 5 s poller may have published it first; either way the row ends up deleted.
      await waitFor(
        () => testApp.dataSource.getRepository(EventOutbox).count(),
        (count) => count === 0,
      );
    });
  });

  describe('failures', () => {
    it('fails at once, without retries, when the profile belongs to another account', async () => {
      const { account } = await seed();
      const foreignProfile = await createProfile(
        testApp.dataSource,
        await createAccount(testApp.dataSource),
      );
      const event = await createEvent(
        testApp.dataSource,
        account,
        foreignProfile,
        'product_viewed',
      );

      await processEvent(event.id, 'failed');
      const job = await getQueue(testApp.app, QUEUE_EVENTS).getJob(event.id);
      expect(job?.attemptsMade).toBe(1);
      expect(job?.failedReason).toContain('does not belong to account');
      expect(await runs().count()).toBe(0);
    });

    it('retries a missing event until the attempts are exhausted', async () => {
      const eventId = randomUUID();

      await processEvent(eventId, 'failed');
      const job = await getQueue(testApp.app, QUEUE_EVENTS).getJob(eventId);
      expect(job?.attemptsMade).toBe(job?.opts.attempts);
      expect(job?.failedReason).toContain('not found');
    });
  });
});
