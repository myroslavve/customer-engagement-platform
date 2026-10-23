import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from './setup/database';
import { createAccount } from './setup/fixtures';
import { obliterateQueues } from './setup/queues';
import { createTestApp, TestApp } from './setup/test-app';

describe('harness', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await obliterateQueues(testApp.app);
    await truncateAll(testApp.dataSource);
  });

  it('boots the application against the test database', async () => {
    const account = await createAccount(testApp.dataSource);
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(testApp.dataSource.options.database).toBe('cep_test');
  });
});
