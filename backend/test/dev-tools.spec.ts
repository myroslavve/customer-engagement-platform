import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_TEMPLATE_NAME, SAMPLE_WORKFLOW_NAME } from '../src/dev-tools/dev-samples';
import { MessageStatus } from '../src/enums/message-status.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { WorkflowStatus } from '../src/enums/workflow-status.enum';
import { QUEUE_NAMES } from '../src/queues/queue-names';
import { DevBootstrapResult } from '../src/types/dev-bootstrap.types';
import { QueueStats } from '../src/types/queue-stats.types';
import { RunDetails } from '../src/types/run-details.types';
import { createAdminToken } from './setup/admin';
import { createAccount } from './setup/fixtures';
import { HttpClient } from './setup/http-client';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

type NamedRow = { id: string; name: string; status?: WorkflowStatus };

describe('dev tools', () => {
  let testApp: TestApp;
  let http: HttpClient;

  beforeAll(async () => {
    testApp = await createTestApp();
    http = await testApp.http();
  });
  afterAll(() => testApp.close());
  beforeEach(() => testApp.reset());

  const bootstrap = (body: Record<string, unknown> = {}) =>
    http.post<DevBootstrapResult>('/dev/bootstrap', body);
  const ingest = (path: string, apiKey: string, body: Record<string, unknown>) =>
    http.post(path, { messageId: randomUUID(), ...body }, { apiKey });
  const listRuns = (token: string, userId: string) =>
    http.get<RunDetails[]>(`/dev/runs?userId=${userId}`, { token });

  describe('bootstrap', () => {
    it('creates an admin, an API key and the active sample workflow, reusing them next time', async () => {
      const first = await bootstrap();
      expect(first.status).toBe(201);
      const { accessToken, apiKey, templateId, workflowId } = first.body;

      expect((await http.get('/admin/auth/me', { token: accessToken })).body).toMatchObject({
        accountId: first.body.accountId,
        email: 'dev@example.com',
      });
      const templates = await http.get<NamedRow[]>('/admin/templates', { token: accessToken });
      expect(templates.body).toEqual([
        expect.objectContaining({ id: templateId, name: SAMPLE_TEMPLATE_NAME }),
      ]);
      const workflows = await http.get<NamedRow[]>('/admin/workflows', { token: accessToken });
      expect(workflows.body).toEqual([
        expect.objectContaining({
          id: workflowId,
          name: SAMPLE_WORKFLOW_NAME,
          status: WorkflowStatus.Active,
        }),
      ]);

      const second = await bootstrap();
      expect(second.body).toMatchObject({
        accountId: first.body.accountId,
        templateId,
        workflowId,
      });
      expect(second.body.apiKey).not.toBe(apiKey);
      for (const key of [apiKey, second.body.apiKey]) {
        expect((await ingest('/api/v1/track', key, { userId: 'u', eventName: 'x' })).status).toBe(
          202,
        );
      }
    });

    it('rejects a known email with another password', async () => {
      await bootstrap({ email: 'me@example.com', password: 'password123' });
      expect(
        (await bootstrap({ email: 'me@example.com', password: 'wrong-password' })).status,
      ).toBe(401);
    });

    it('validates its input', async () => {
      expect((await bootstrap({ email: 'nope' })).status).toBe(400);
      expect((await bootstrap({ password: 'short' })).status).toBe(400);
    });
  });

  describe('runs', () => {
    it('shows a run with its steps and messages, and fast-forwards its wait timeout', async () => {
      const { accessToken: token, apiKey } = (await bootstrap()).body;
      await ingest('/api/v1/identify', apiKey, {
        userId: 'u1',
        email: 'ann@example.com',
        traits: { name: 'Ann' },
      });
      await ingest('/api/v1/track', apiKey, {
        userId: 'u1',
        eventName: 'item_viewed',
        properties: { product_title: 'Shoes' },
      });
      const [waiting] = (
        await waitFor(
          () => listRuns(token, 'u1'),
          (response) => response.body[0]?.status === RunStatus.Waiting,
        )
      ).body;

      // The sample waits a day; fast-forward fires the timeout now.
      const forwarded = await http.post(`/dev/runs/${waiting.id}/fast-forward`, undefined, {
        token,
      });
      expect(forwarded).toEqual({ status: 200, body: { promoted: 1 } });

      const run = await waitFor(
        () => http.get<RunDetails>(`/dev/runs/${waiting.id}`, { token }),
        (response) => response.body.messages[0]?.status === MessageStatus.Sent,
      );
      expect(run.body).toMatchObject({ id: waiting.id, status: RunStatus.Completed });
      expect(run.body.steps.map((step) => [step.nodeId, step.cause])).toEqual([
        ['wait_purchase', StepCause.Enter],
        ['wait_purchase', StepCause.Timeout],
        ['send_reminder', StepCause.Enter],
        ['done', StepCause.Enter],
      ]);
      expect(testApp.fakeEmailProvider.sent[0]).toMatchObject({
        to: 'ann@example.com',
        subject: 'Still thinking about Shoes?',
      });
      expect((await listRuns(token, 'someone-else')).body).toEqual([]);
    });

    it("hides another account's runs", async () => {
      const { accessToken: token, apiKey } = (await bootstrap()).body;
      await ingest('/api/v1/track', apiKey, { userId: 'u1', eventName: 'item_viewed' });
      const [run] = (
        await waitFor(
          () => listRuns(token, 'u1'),
          (response) => response.body.length === 1,
        )
      ).body;

      const otherToken = await createAdminToken(testApp, await createAccount(testApp.dataSource));
      expect((await http.get(`/dev/runs/${run.id}`, { token: otherToken })).status).toBe(404);
      const forwarded = await http.post(`/dev/runs/${run.id}/fast-forward`, undefined, {
        token: otherToken,
      });
      expect(forwarded.status).toBe(404);
      expect((await http.get<RunDetails[]>('/dev/runs', { token: otherToken })).body).toEqual([]);
    });
  });

  it('reports the job counts of every queue', async () => {
    const { accessToken: token } = (await bootstrap()).body;
    const stats = await http.get<QueueStats[]>('/dev/queues', { token });
    expect(stats.body.map((queue) => queue.queue)).toEqual(QUEUE_NAMES);
    expect(stats.body[0].counts).toHaveProperty('delayed');
  });

  it('requires an admin token for everything but bootstrap', async () => {
    expect((await http.get('/dev/runs')).status).toBe(401);
    expect((await http.get('/dev/queues')).status).toBe(401);
  });
});

describe('dev tools disabled', () => {
  let testApp: TestApp;
  let http: HttpClient;

  // The config is read when the application is built, so the flag only has to be off meanwhile.
  beforeAll(async () => {
    const previous = process.env.DEV_TOOLS_ENABLED;
    process.env.DEV_TOOLS_ENABLED = 'false';
    try {
      testApp = await createTestApp();
    } finally {
      process.env.DEV_TOOLS_ENABLED = previous;
    }
    http = await testApp.http();
  });
  afterAll(() => testApp.close());

  it('answers 404 on every /dev route', async () => {
    expect((await http.post('/dev/bootstrap', {})).status).toBe(404);
    expect((await http.get('/dev/queues')).status).toBe(404);
  });
});
