import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RunStep } from '../src/database/entities/run-step.entity';
import { WorkflowRun } from '../src/database/entities/workflow-run.entity';
import { NodeType } from '../src/enums/node-type.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { WorkflowDefinition } from '../src/types/workflow-definition.types';
import { createAdminToken } from './setup/admin';
import { createAccount } from './setup/fixtures';
import { HttpClient } from './setup/http-client';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

type IdBody = { id: string };
type ApiKeyBody = { key: string };

/** item_viewed → wait for purchase → reminder on timeout. */
function abandonedViewDefinition(templateId: string, timeoutMs: number): WorkflowDefinition {
  return {
    trigger: { eventName: 'item_viewed' },
    entryNodeId: 'wait',
    nodes: [
      {
        id: 'wait',
        type: NodeType.WaitForEvent,
        eventName: 'purchase',
        timeoutMs,
        next: 'done',
        timeoutNext: 'send',
      },
      { id: 'send', type: NodeType.SendEmail, templateId, next: 'done' },
      { id: 'done', type: NodeType.Exit },
    ],
  };
}

/**
 * The whole platform through its HTTP APIs, as the admin UI and the customer product use it: admin
 * setup, ingestion, the queue processors, and the email provider (faked).
 */
describe('pipeline over HTTP', () => {
  let testApp: TestApp;
  let http: HttpClient;
  let token: string;
  let apiKey: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    http = await testApp.http();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.reset();
    token = await createAdminToken(testApp, await createAccount(testApp.dataSource));
    apiKey = (await http.post<ApiKeyBody>('/admin/auth/api-keys', { name: 'k' }, { token })).body
      .key;
  });

  const runs = () => testApp.dataSource.getRepository(WorkflowRun);
  const steps = (runId: string) =>
    testApp.dataSource
      .getRepository(RunStep)
      .find({ where: { runId }, order: { createdAt: 'ASC' } });

  async function publishAbandonedView(timeoutMs: number): Promise<void> {
    const template = await http.post<IdBody>(
      '/admin/templates',
      {
        name: 'reminder',
        subject: 'Still thinking about {{event.properties.title}}?',
        body: '<p>Hi {{profile.traits.name}}, {{event.properties.title}} is waiting.</p>',
      },
      { token },
    );
    const workflow = await http.post<IdBody>(
      '/admin/workflows',
      { name: 'abandoned view', definition: abandonedViewDefinition(template.body.id, timeoutMs) },
      { token },
    );
    await http.post(`/admin/workflows/${workflow.body.id}/publish`, undefined, { token });
  }

  async function ingest(path: string, body: Record<string, unknown>): Promise<void> {
    const response = await http.post(path, { messageId: crypto.randomUUID(), ...body }, { apiKey });
    expect(response.status).toBe(202);
  }

  const waitForRun = (predicate: (run: WorkflowRun) => boolean) =>
    waitFor(
      () => runs().findOne({ where: {} }),
      (run) => run !== null && predicate(run),
    ) as Promise<WorkflowRun>;

  it('sends the reminder when the awaited event does not come in time', async () => {
    await publishAbandonedView(200);
    await ingest('/api/v1/identify', {
      userId: 'u1',
      email: 'ann@example.com',
      traits: { name: 'Ann' },
    });
    await ingest('/api/v1/track', {
      userId: 'u1',
      eventName: 'item_viewed',
      properties: { title: 'Shoes' },
    });

    const run = await waitForRun((found) => found.status === RunStatus.Completed);
    await waitFor(
      async () => testApp.fakeEmailProvider.sent.length,
      (count) => count === 1,
    );
    expect(testApp.fakeEmailProvider.sent[0]).toMatchObject({
      to: 'ann@example.com',
      subject: 'Still thinking about Shoes?',
      html: '<p>Hi Ann, Shoes is waiting.</p>',
    });
    expect((await steps(run.id)).map((step) => [step.nodeId, step.cause])).toEqual([
      ['wait', StepCause.Enter],
      ['wait', StepCause.Timeout],
      ['send', StepCause.Enter],
      ['done', StepCause.Enter],
    ]);
  });

  it('completes without an email when the awaited event arrives', async () => {
    await publishAbandonedView(60_000);
    await ingest('/api/v1/identify', { userId: 'u1', email: 'ann@example.com' });
    await ingest('/api/v1/track', { userId: 'u1', eventName: 'item_viewed' });
    await waitForRun((found) => found.status === RunStatus.Waiting);

    await ingest('/api/v1/track', { userId: 'u1', eventName: 'purchase' });

    const run = await waitForRun((found) => found.status === RunStatus.Completed);
    expect((await steps(run.id)).map((step) => [step.nodeId, step.cause])).toEqual([
      ['wait', StepCause.Enter],
      ['wait', StepCause.Event],
      ['done', StepCause.Enter],
    ]);
    expect(testApp.fakeEmailProvider.calls).toBe(0);
  });
});
