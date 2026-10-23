import './env';
import './ts-node';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { DatabaseConfig, databaseConfig } from '../../src/config/db.config';
import { redisConfig } from '../../src/config/redis.config';
import { buildDataSourceOptions } from '../../src/database/database.module';

/** Once per run: create the test database if missing and bring it to the latest migration. */
export default async function globalSetup(): Promise<void> {
  const config = databaseConfig();
  // Tests truncate every table and obliterate the queues; never point them at real data.
  if (!config.database.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against database "${config.database}"`);
  }
  const { db } = redisConfig();
  if (db === 0) {
    throw new Error('Refusing to run integration tests against Redis db 0 (the app default)');
  }
  await createDatabaseIfMissing(config);
  await runMigrations(config);
}

/** Through the `postgres` maintenance database, with the same credentials. */
async function createDatabaseIfMissing(config: DatabaseConfig): Promise<void> {
  const maintenance = new DataSource({
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: 'postgres',
    ssl: config.ssl,
  });
  await maintenance.initialize();
  try {
    const existing: unknown[] = await maintenance.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database],
    );
    if (existing.length === 0) await maintenance.query(`CREATE DATABASE "${config.database}"`);
  } finally {
    await maintenance.destroy();
  }
}

async function runMigrations(config: DatabaseConfig): Promise<void> {
  const dataSource = new DataSource(buildDataSourceOptions(config));
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}
