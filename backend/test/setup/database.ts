import { DataSource } from 'typeorm';

/** Empties every entity table; CASCADE also empties the entity-less admin tables (they reference accounts). */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas.map((metadata) => `"${metadata.tableName}"`).join(', ');
  await dataSource.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
