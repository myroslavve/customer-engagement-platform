import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../src/database/entities/account.entity';
import { Profile } from '../src/database/entities/profile.entity';
import { UserEvent } from '../src/database/entities/user-event.entity';
import { QUEUE_EVENTS } from '../src/queues/queue-names';
import { IngestionResult } from '../src/types/ingestion-result.types';
import { createAdminToken } from './setup/admin';
import { createAccount } from './setup/fixtures';
import { HttpClient } from './setup/http-client';
import { waitForJobState } from './setup/queues';
import { createTestApp, TestApp } from './setup/test-app';

/** INGESTION_API_KEY / INGESTION_ACCOUNT_ID of .env.test. */
const STATIC_API_KEY = 'test-api-key';
const STATIC_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

type ApiKeyResponse = { id: string; key: string };

describe('ingestion API', () => {
  let testApp: TestApp;
  let http: HttpClient;

  beforeAll(async () => {
    testApp = await createTestApp();
    http = await testApp.http();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.reset();
    await testApp.dataSource
      .getRepository(Account)
      .save({ id: STATIC_ACCOUNT_ID, name: 'static key account' });
  });

  const events = () => testApp.dataSource.getRepository(UserEvent);
  const profiles = () => testApp.dataSource.getRepository(Profile);

  const identify = (body: Record<string, unknown>, apiKey = STATIC_API_KEY) =>
    http.post<IngestionResult>(
      '/api/v1/identify',
      { messageId: randomUUID(), ...body },
      { apiKey },
    );
  const track = (body: Record<string, unknown>, apiKey = STATIC_API_KEY) =>
    http.post<IngestionResult>('/api/v1/track', { messageId: randomUUID(), ...body }, { apiKey });

  it('stores identify and track events, upserts the profile and queues each event', async () => {
    const identified = await identify({
      userId: 'u1',
      email: 'ann@example.com',
      traits: { name: 'Ann', plan: 'free' },
    });
    const tracked = await track({
      userId: 'u1',
      eventName: 'item_viewed',
      properties: { sku: 'A' },
    });
    await identify({ userId: 'u1', traits: { plan: 'pro' } });

    expect(identified.status).toBe(202);
    expect(tracked).toEqual({ status: 202, body: { accepted: true, eventId: expect.any(String) } });
    const profile = await profiles().findOneByOrFail({ externalId: 'u1' });
    // A later identify without email keeps the stored one; traits are merged.
    expect(profile).toMatchObject({
      accountId: STATIC_ACCOUNT_ID,
      email: 'ann@example.com',
      traits: { name: 'Ann', plan: 'pro' },
    });
    const event = await events().findOneByOrFail({ id: tracked.body.eventId });
    expect(event).toMatchObject({
      profileId: profile.id,
      name: 'item_viewed',
      properties: { sku: 'A' },
    });
    expect(await waitForJobState(testApp.app, QUEUE_EVENTS, event.id, 'completed')).toBe(
      'completed',
    );
  });

  it('answers 409 to a repeated messageId and stores the event once', async () => {
    const body = { userId: 'u1', eventName: 'page', messageId: 'msg-1' };
    expect((await track(body)).status).toBe(202);
    expect((await track(body)).status).toBe(409);
    expect(await events().countBy({ messageId: 'msg-1' })).toBe(1);
  });

  it('rejects invalid payloads without storing anything', async () => {
    expect((await track({ userId: 'u1' })).status).toBe(400);
    expect((await identify({ userId: 'u1', email: 'not-an-email' })).status).toBe(400);
    expect((await track({ userId: '', eventName: 'x' })).status).toBe(400);
    expect(await events().count()).toBe(0);
  });

  it('maps a database API key to its account and rejects revoked, unknown and missing keys', async () => {
    const account = await createAccount(testApp.dataSource);
    const token = await createAdminToken(testApp, account);
    const created = await http.post<ApiKeyResponse>(
      '/admin/auth/api-keys',
      { name: 'k' },
      { token },
    );

    const tracked = await track({ userId: 'u2', eventName: 'page' }, created.body.key);
    expect(tracked.status).toBe(202);
    expect((await events().findOneByOrFail({ id: tracked.body.eventId })).accountId).toBe(
      account.id,
    );

    expect((await http.delete(`/admin/auth/api-keys/${created.body.id}`, { token })).status).toBe(
      200,
    );
    expect((await track({ userId: 'u2', eventName: 'page' }, created.body.key)).status).toBe(401);
    expect((await track({ userId: 'u2', eventName: 'page' }, 'cep_unknown')).status).toBe(401);
    expect((await http.post('/api/v1/track', { userId: 'u2', eventName: 'page' })).status).toBe(
      401,
    );
  });
});
