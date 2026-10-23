import { describe, expect, it, vi } from 'vitest';
import { ActivityService } from './activity.service';

const eventRow = {
  id: 'event-1',
  name: 'purchase',
  properties: { total: 10 },
  message_id: 'msg-1',
  occurred_at: new Date('2026-01-02T00:00:00Z'),
  received_at: new Date('2026-01-02T00:00:01Z'),
  profile_id: 'profile-1',
  external_id: 'user-1',
  email: 'one@example.com',
};

const runRow = {
  id: 'run-1',
  workflow_id: 'workflow-1',
  workflow_name: 'Welcome',
  workflow_version_id: 'version-1',
  profile_id: 'profile-1',
  external_id: 'user-1',
  email: 'one@example.com',
  trigger_event_id: 'event-1',
  status: 'failed',
  current_node_id: 'send',
  waiting_for_event: null,
  wait_until: null,
  context: { error: 'boom' },
  created_at: new Date('2026-01-03T00:00:00Z'),
  updated_at: new Date('2026-01-03T00:00:05Z'),
  finished_at: new Date('2026-01-03T00:00:05Z'),
};

const messageRow = {
  id: 'message-1',
  run_id: 'run-1',
  node_id: 'send',
  profile_id: 'profile-1',
  external_id: 'user-1',
  email: 'one@example.com',
  to_email: 'one@example.com',
  template_id: 'template-1',
  subject: 'Hello',
  status: 'sent',
  error: null,
  attempts: 1,
  sent_at: new Date('2026-01-01T00:00:00Z'),
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('ActivityService', () => {
  it('builds account-scoped filtered activity queries', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [eventRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ present: false }] }),
    };
    const service = new ActivityService(database as never);

    const items = await service.list('account-1', {
      profileId: 'profile-1',
      eventName: 'purchase',
      from: '2026-01-01T00:00:00Z',
      limit: 20,
    });

    expect(database.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('e.profile_id = $2'),
      ['account-1', 'profile-1', 'purchase', '2026-01-01T00:00:00Z', 20],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'event',
      id: 'event-1',
      name: 'purchase',
      profileId: 'profile-1',
      timestamp: '2026-01-02T00:00:00.000Z',
    });
  });

  it('reports run status, timestamps and failure details', async () => {
    const database = { query: vi.fn().mockResolvedValueOnce({ rows: [runRow] }) };
    const service = new ActivityService(database as never);

    const items = await service.list('account-1', { type: 'run', status: 'failed' });

    expect(database.query.mock.calls[0][0]).toContain('r.status = $2');
    expect(items).toEqual([
      expect.objectContaining({
        type: 'run',
        id: 'run-1',
        status: 'failed',
        workflowName: 'Welcome',
        currentNodeId: 'send',
        error: 'boom',
        timestamp: '2026-01-03T00:00:00.000Z',
        finishedAt: '2026-01-03T00:00:05.000Z',
      }),
    ]);
  });

  it('leaves the event stream out when the filter is about runs or messages', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new ActivityService(database as never);

    await service.list('account-1', { status: 'failed' });

    const statements = database.query.mock.calls.map((call) => String(call[0]));
    expect(statements.some((sql) => sql.includes('FROM events'))).toBe(false);
    expect(statements.some((sql) => sql.includes('FROM workflow_runs'))).toBe(true);
  });

  it('returns message activity only when the messages table exists', async () => {
    const absent = { query: vi.fn().mockResolvedValue({ rows: [{ present: false }] }) };
    await expect(
      new ActivityService(absent as never).list('account-1', { type: 'message' }),
    ).resolves.toEqual([]);
    expect(absent.query).toHaveBeenCalledTimes(1);

    const present = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ present: true }] })
        .mockResolvedValueOnce({ rows: [messageRow] }),
    };
    const items = await new ActivityService(present as never).list('account-1', {
      type: 'message',
    });
    expect(items).toEqual([
      expect.objectContaining({
        type: 'message',
        id: 'message-1',
        status: 'sent',
        email: 'one@example.com',
        error: null,
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    ]);
  });

  it('retries the message table check after a transient failure', async () => {
    const database = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ rows: [{ present: true }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new ActivityService(database as never);

    await expect(service.list('account-1', { type: 'message' })).resolves.toEqual([]);
    await service.list('account-1', { type: 'message' });

    // A failure is not cached: the second request probes the schema and then reads messages.
    expect(database.query).toHaveBeenCalledTimes(3);
  });

  it('caps requested activity limits', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const service = new ActivityService(database as never);

    await service.list('account-1', { limit: 10_000 });
    expect(database.query.mock.calls[0][1]).toEqual(['account-1', 500]);
  });

  it('bounds user timelines to the requested limit', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const service = new ActivityService(database as never);

    await service.userTimeline('account-1', 'user-1', 10_000);
    expect(database.query.mock.calls[0][1]).toEqual(['account-1', 'user-1', 500]);
  });

  it('orders a user timeline across events, runs and messages newest first', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [eventRow] })
        .mockResolvedValueOnce({ rows: [runRow] })
        .mockResolvedValueOnce({ rows: [{ present: true }] })
        .mockResolvedValueOnce({ rows: [messageRow] }),
    };
    const service = new ActivityService(database as never);

    const items = await service.userTimeline('account-1', 'user-1', 50);

    expect(items.map((item) => item.type)).toEqual(['run', 'event', 'message']);
    expect(database.query.mock.calls[0][1]).toEqual(['account-1', 'user-1', 50]);
    expect(database.query.mock.calls[1][1]).toEqual(['account-1', 'user-1', 50]);
  });
});
