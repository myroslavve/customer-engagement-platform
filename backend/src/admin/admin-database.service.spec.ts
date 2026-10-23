import { describe, expect, it, vi } from 'vitest';
import { AdminDatabaseService } from './admin-database.service';

describe('AdminDatabaseService', () => {
  it('normalizes PostgreSQL UPDATE RETURNING results', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([[{ id: 'workflow-1' }], 1]),
    };
    const service = new AdminDatabaseService(dataSource as never);

    await expect(
      service.query('UPDATE workflows SET status = $1 RETURNING id', ['active']),
    ).resolves.toEqual({ rows: [{ id: 'workflow-1' }] });
  });

  it('normalizes an unmatched PostgreSQL UPDATE RETURNING result to empty rows', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([[], 0]),
    };
    const service = new AdminDatabaseService(dataSource as never);

    await expect(
      service.query('UPDATE workflows SET status = $1 RETURNING id', ['active']),
    ).resolves.toEqual({ rows: [] });
  });

  it('preserves regular SELECT row arrays', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([{ id: 'workflow-1' }]),
    };
    const service = new AdminDatabaseService(dataSource as never);

    await expect(service.query('SELECT id FROM workflows')).resolves.toEqual({
      rows: [{ id: 'workflow-1' }],
    });
  });
});
