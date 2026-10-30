import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../src/database/entities/account.entity';
import { NodeType } from '../src/enums/node-type.enum';
import { WorkflowStatus } from '../src/enums/workflow-status.enum';
import { WorkflowDefinition } from '../src/types/workflow-definition.types';
import { createAdminToken } from './setup/admin';
import { createAccount } from './setup/fixtures';
import { HttpClient } from './setup/http-client';
import { createTestApp, TestApp } from './setup/test-app';

type CreatedWorkflow = { id: string; status: WorkflowStatus; version: { id: string } };
type WorkflowState = { id: string; status: WorkflowStatus; published_version_id: string | null };

const DEFINITION: WorkflowDefinition = {
  trigger: { eventName: 'signed_up' },
  entryNodeId: 'wait',
  nodes: [{ id: 'wait', type: NodeType.Delay, durationMs: 1000, next: null }],
};

describe('admin workflows API', () => {
  let testApp: TestApp;
  let http: HttpClient;
  let account: Account;
  let token: string;

  beforeAll(async () => {
    testApp = await createTestApp();
    http = await testApp.http();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.reset();
    account = await createAccount(testApp.dataSource);
    token = await createAdminToken(testApp, account);
  });

  const create = (definition: unknown = DEFINITION, adminToken = token) =>
    http.post<CreatedWorkflow>(
      '/admin/workflows',
      { name: 'wf', definition },
      { token: adminToken },
    );
  const transition = (id: string, action: string, adminToken = token) =>
    http.post<WorkflowState>(`/admin/workflows/${id}/${action}`, undefined, { token: adminToken });

  it('publishes, pauses and resumes a workflow', async () => {
    const created = await create();
    expect(created).toMatchObject({ status: 201, body: { status: WorkflowStatus.Draft } });
    const { id } = created.body;

    expect(await transition(id, 'publish')).toMatchObject({
      status: 201,
      body: { status: WorkflowStatus.Active, published_version_id: created.body.version.id },
    });
    expect((await transition(id, 'pause')).body.status).toBe(WorkflowStatus.Paused);
    expect((await transition(id, 'pause')).status).toBe(404);
    expect((await transition(id, 'resume')).body.status).toBe(WorkflowStatus.Active);
    expect((await transition(id, 'resume')).status).toBe(404);
  });

  it("does not let another account's admin change the workflow", async () => {
    const created = await create();
    const otherToken = await createAdminToken(testApp, await createAccount(testApp.dataSource));
    expect((await transition(created.body.id, 'publish', otherToken)).status).toBe(404);
  });

  it('answers 400 to a malformed workflow id', async () => {
    expect((await transition('not-a-uuid', 'publish')).status).toBe(400);
  });

  it('rejects definitions with a cycle or a dangling target', async () => {
    const cyclic = {
      ...DEFINITION,
      nodes: [{ id: 'wait', type: NodeType.Delay, durationMs: 1, next: 'wait' }],
    };
    const dangling = {
      ...DEFINITION,
      nodes: [{ id: 'wait', type: NodeType.Delay, durationMs: 1, next: 'missing' }],
    };
    expect((await create(cyclic)).status).toBe(400);
    expect((await create(dangling)).status).toBe(400);
  });

  it('requires an admin token', async () => {
    expect((await http.get('/admin/workflows')).status).toBe(401);
    expect((await http.get('/admin/workflows', { token: 'garbage' })).status).toBe(401);
  });
});
