import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminDatabaseService } from './admin-database.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('AdminDatabaseService PostgreSQL integration', () => {
  let dataSource: DataSource;
  let service: AdminDatabaseService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl!,
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.query(
      'CREATE TEMP TABLE admin_database_query_test (id integer PRIMARY KEY, status text NOT NULL)',
    );
    await dataSource.query('INSERT INTO admin_database_query_test (id, status) VALUES (1, $1)', [
      'draft',
    ]);
    service = new AdminDatabaseService(dataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('returns the row from a matched UPDATE RETURNING statement', async () => {
    await expect(
      service.query(
        'UPDATE admin_database_query_test SET status = $1 WHERE id = $2 RETURNING id, status',
        ['active', 1],
      ),
    ).resolves.toEqual({ rows: [{ id: 1, status: 'active' }] });
  });

  it('returns no rows from an unmatched UPDATE RETURNING statement', async () => {
    await expect(
      service.query(
        'UPDATE admin_database_query_test SET status = $1 WHERE id = $2 RETURNING id, status',
        ['active', 999],
      ),
    ).resolves.toEqual({ rows: [] });
  });
});
