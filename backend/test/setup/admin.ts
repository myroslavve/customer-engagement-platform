import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Account } from '../../src/database/entities/account.entity';
import { TestApp } from './test-app';

/**
 * An admin of the account and a token for it, without the throttled register endpoint. The
 * admin_users table has no entity; the password hash is never checked by the guard.
 */
export async function createAdminToken(testApp: TestApp, account: Account): Promise<string> {
  const email = `admin-${randomUUID()}@example.com`;
  const rows: Array<{ id: string }> = await testApp.dataSource.query(
    `INSERT INTO admin_users (account_id, email, password_hash) VALUES ($1, $2, 'unused') RETURNING id`,
    [account.id, email],
  );
  return testApp.get(JwtService).sign({
    userId: rows[0].id,
    accountId: account.id,
    email,
    role: 'admin',
    tokenVersion: 0,
  });
}
