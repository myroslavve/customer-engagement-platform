import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEV_SCENARIOS } from '../src/dev-tools/dev-scenarios';
import { MessageReason } from '../src/enums/message-reason.enum';
import { MessageStatus } from '../src/enums/message-status.enum';
import { NodeType } from '../src/enums/node-type.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { DevBootstrapResult } from '../src/types/dev-bootstrap.types';
import { DevScenarioInfo } from '../src/types/dev-scenario.types';
import { DevTriggerResult } from '../src/types/dev-trigger.types';
import { RunDetails } from '../src/types/run-details.types';
import { HttpClient } from './setup/http-client';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

const FINAL_RUN = new Set([RunStatus.Completed, RunStatus.Failed]);
const FINAL_MESSAGE = new Set([MessageStatus.Sent, MessageStatus.Skipped, MessageStatus.Failed]);

/** Every scenario driven the way a developer would: run it, send events, fast-forward, inspect. */
describe('dev scenarios', () => {
  let testApp: TestApp;
  let http: HttpClient;
  let token: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    http = await testApp.http();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.reset();
    token = (await http.post<DevBootstrapResult>('/dev/bootstrap', {})).body.accessToken;
  });

  async function runScenario(name: string, body: Record<string, unknown> = {}): Promise<string> {
    const response = await http.post<DevTriggerResult>(`/dev/scenarios/${name}/run`, body, {
      token,
    });
    expect(response.status).toBe(201);
    expect(response.body.runId).toEqual(expect.any(String));
    return response.body.runId!;
  }

  const getRun = async (runId: string) =>
    (await http.get<RunDetails>(`/dev/runs/${runId}`, { token })).body;
  const waitForRun = (runId: string, predicate: (run: RunDetails) => boolean) =>
    waitFor(() => getRun(runId), predicate);
  /** Completed or failed, and every message it recorded is final too. */
  const waitForFinished = (runId: string) =>
    waitForRun(
      runId,
      (run) =>
        FINAL_RUN.has(run.status) &&
        run.messages.every((message) => FINAL_MESSAGE.has(message.status)),
    );
  const fastForward = (runId: string) =>
    http.post<{ promoted: number }>(`/dev/runs/${runId}/fast-forward`, undefined, { token });
  const sendEvent = (runId: string, eventName: string, properties: Record<string, unknown>) =>
    http.post(`/dev/runs/${runId}/events`, { eventName, properties }, { token });
  const path = (run: RunDetails) => run.steps.map((step) => `${step.nodeId}:${step.cause}`);
  const messageOutcomes = (run: RunDetails) =>
    run.messages.map((message) => [message.status, message.error]);

  it('lists every scenario', async () => {
    const response = await http.get<DevScenarioInfo[]>('/dev/scenarios', { token });
    expect(response.body.map((scenario) => scenario.name)).toEqual(
      DEV_SCENARIOS.map((scenario) => scenario.name),
    );
  });

  it('send-email: sends, or skips a profile without an address or unsubscribed', async () => {
    const sent = await waitForFinished(await runScenario('send-email'));
    expect(path(sent)).toEqual(['send:enter', 'done:enter']);
    expect(messageOutcomes(sent)).toEqual([[MessageStatus.Sent, null]]);
    expect(testApp.fakeEmailProvider.sent[0].subject).toBe('Still thinking about Test product?');

    const noEmail = await waitForFinished(await runScenario('send-email', { email: null }));
    expect(messageOutcomes(noEmail)).toEqual([[MessageStatus.Skipped, MessageReason.NoEmail]]);

    const unsubscribed = await waitForFinished(
      await runScenario('send-email', { unsubscribed: true }),
    );
    expect(messageOutcomes(unsubscribed)).toEqual([
      [MessageStatus.Skipped, MessageReason.Unsubscribed],
    ]);
  });

  it('branch: sends to pro profiles only', async () => {
    const pro = await waitForFinished(await runScenario('branch', { traits: { plan: 'pro' } }));
    expect(path(pro)).toEqual(['plan:enter', 'send:enter', 'done:enter']);
    expect(messageOutcomes(pro)).toEqual([[MessageStatus.Sent, null]]);

    const free = await waitForFinished(await runScenario('branch', { traits: { plan: 'free' } }));
    expect(path(free)).toEqual(['plan:enter', 'done:enter']);
    expect(free.messages).toEqual([]);
  });

  it('delay: holds the run until fast-forward', async () => {
    const runId = await runScenario('delay');
    await waitForRun(runId, (run) => run.currentNodeId === 'send');
    expect((await fastForward(runId)).body).toEqual({ promoted: 1 });

    const run = await waitForFinished(runId);
    expect(path(run)).toEqual(['delay:enter', 'send:enter', 'done:enter']);
    expect(messageOutcomes(run)).toEqual([[MessageStatus.Sent, null]]);
  });

  it('wait-for-event: the awaited event takes the event path, fast-forward the timeout path', async () => {
    const byEvent = await runScenario('wait-for-event');
    await waitForRun(byEvent, (run) => run.status === RunStatus.Waiting);
    expect((await sendEvent(byEvent, 'purchase', { amount: 0 })).status).toBe(202);
    expect((await sendEvent(byEvent, 'purchase', { amount: 10 })).status).toBe(202);
    const resumed = await waitForFinished(byEvent);
    expect(path(resumed)).toEqual(['wait:enter', 'wait:event', 'done:enter']);
    expect(resumed.messages).toEqual([]);

    const byTimeout = await runScenario('wait-for-event');
    await waitForRun(byTimeout, (run) => run.status === RunStatus.Waiting);
    await fastForward(byTimeout);
    const timedOut = await waitForFinished(byTimeout);
    expect(path(timedOut)).toEqual(['wait:enter', 'wait:timeout', 'send:enter', 'done:enter']);
    expect(messageOutcomes(timedOut)).toEqual([[MessageStatus.Sent, null]]);
  });

  it('missing-template: fails the run with the error', async () => {
    const run = await waitForFinished(await runScenario('missing-template'));
    expect(run.status).toBe(RunStatus.Failed);
    expect(run.context.error).toMatch(/not found/);
    expect(run.steps).toEqual([
      expect.objectContaining({ nodeId: 'send', status: 'failed', cause: StepCause.Enter }),
    ]);
  });

  it('everything: delay, branch, wait and send in one run', async () => {
    const pro = await runScenario('everything', { traits: { plan: 'pro' } });
    await waitForRun(pro, (run) => run.currentNodeId === 'plan');
    await fastForward(pro);
    await waitForRun(pro, (run) => run.status === RunStatus.Waiting);
    await sendEvent(pro, 'purchase', { amount: 5 });
    expect(path(await waitForFinished(pro))).toEqual([
      'delay:enter',
      'plan:enter',
      'wait:enter',
      'wait:event',
      'done:enter',
    ]);

    const free = await runScenario('everything');
    await waitForRun(free, (run) => run.currentNodeId === 'plan');
    await fastForward(free);
    const freeRun = await waitForFinished(free);
    expect(path(freeRun)).toEqual(['delay:enter', 'plan:enter', 'send:enter', 'done:enter']);
    expect(messageOutcomes(freeRun)).toEqual([[MessageStatus.Sent, null]]);
  });

  it('answers 404 to an unknown scenario', async () => {
    expect((await http.post('/dev/scenarios/nope/run', {}, { token })).status).toBe(404);
  });

  describe('ad-hoc workflows', () => {
    const definition = {
      trigger: {
        eventName: 'ignored',
        filter: { field: 'event.properties.source', op: 'eq', value: 'web' },
      },
      entryNodeId: 'plan',
      nodes: [
        {
          id: 'plan',
          type: NodeType.Branch,
          condition: { field: 'event.properties.total', op: 'gte', value: 100 },
          next: 'big',
          elseNext: 'small',
        },
        { id: 'big', type: NodeType.Exit },
        { id: 'small', type: NodeType.Exit },
      ],
    };
    const runDefinition = (body: Record<string, unknown>) =>
      http.post<DevTriggerResult>('/dev/workflows/run', { definition, ...body }, { token });

    it('runs a definition with its trigger filter, under a trigger event of its own', async () => {
      const response = await runDefinition({ properties: { source: 'web', total: 150 } });
      expect(response.body.eventName).toMatch(/^dev\.adhoc\./);
      const run = await waitForFinished(response.body.runId!);
      expect(path(run)).toEqual(['plan:enter', 'big:enter']);

      // The filter rejects the event: no run.
      const filtered = await runDefinition({ properties: { source: 'ios', total: 150 } });
      expect(filtered.body).toMatchObject({ runId: null, eventId: expect.any(String) });
    }, 15_000);

    it('rejects an invalid definition', async () => {
      const cyclic = {
        ...definition,
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: NodeType.Delay, durationMs: 1, next: 'a' }],
      };
      const response = await http.post('/dev/workflows/run', { definition: cyclic }, { token });
      expect(response.status).toBe(400);
    });
  });
});
