import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminDatabaseService } from '../src/admin/admin-database.service';
import { Account } from '../src/database/entities/account.entity';
import { createAccount } from './setup/fixtures';
import { createTestApp, TestApp } from './setup/test-app';

const UPDATE_RETURNING = 'UPDATE accounts SET name = $1 WHERE id = $2 RETURNING id, name';

describe('AdminDatabaseService', () => {
  let testApp: TestApp;
  let adminDatabaseService: AdminDatabaseService;
  let account: Account;

  beforeAll(async () => {
    testApp = await createTestApp();
    adminDatabaseService = testApp.get(AdminDatabaseService);
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await testApp.reset();
    account = await createAccount(testApp.dataSource);
  });

  it('returns the row from a matched UPDATE RETURNING statement', async () => {
    await expect(
      adminDatabaseService.query(UPDATE_RETURNING, ['Renamed', account.id]),
    ).resolves.toEqual({
      rows: [{ id: account.id, name: 'Renamed' }],
    });
  });

  it('returns no rows from an unmatched UPDATE RETURNING statement', async () => {
    await expect(
      adminDatabaseService.query(UPDATE_RETURNING, [
        'Renamed',
        '00000000-0000-0000-0000-000000000000',
      ]),
    ).resolves.toEqual({ rows: [] });
  });
});
