import 'dotenv/config';
import 'reflect-metadata';
import { hash } from 'bcryptjs';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/db.config';
import { buildDataSourceOptions } from '../database/database.module';

async function provisionAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || (!passwordHash && !password)) {
    throw new Error(
      'Set ADMIN_EMAIL and either ADMIN_PASSWORD_HASH or ADMIN_PASSWORD before running admin:provision',
    );
  }

  const resolvedPasswordHash =
    passwordHash ?? (await hash(password as string, Number(process.env.ADMIN_PASSWORD_COST ?? 12)));
  const dataSource = new DataSource(buildDataSourceOptions(databaseConfig()));

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      const existing = (await manager.query(
        'SELECT id, account_id FROM admin_users WHERE LOWER(email) = $1',
        [email],
      )) as Array<{ id: string; account_id: string }>;
      if (existing[0]) {
        console.log(`Admin already exists for account ${existing[0].account_id}`);
        return;
      }

      const accounts = (await manager.query(
        'SELECT id FROM accounts ORDER BY created_at ASC LIMIT 1',
      )) as Array<{ id: string }>;
      const accountId =
        accounts[0]?.id ??
        (
          (await manager.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
            process.env.ADMIN_ACCOUNT_NAME?.trim() || 'Default account',
          ])) as Array<{ id: string }>
        )[0].id;

      await manager.query(
        `INSERT INTO admin_users (account_id, email, password_hash)
         VALUES ($1, $2, $3)`,
        [accountId, email, resolvedPasswordHash],
      );
      console.log(`Created admin ${email} for account ${accountId}`);
    });
  } finally {
    await dataSource.destroy();
  }
}

provisionAdmin().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
