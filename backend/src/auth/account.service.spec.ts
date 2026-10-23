import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountService } from './account.service';

describe('AccountService', () => {
  it('returns the account for the JWT account id', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'account-1', name: 'Acme', created_at: 'now', updated_at: 'now' }],
      }),
    };
    const service = new AccountService(database as never);

    await expect(service.get('account-1')).resolves.toMatchObject({ name: 'Acme' });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('FROM accounts'), [
      'account-1',
    ]);
  });

  it('reports a missing account', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new AccountService(database as never);

    await expect(service.get('account-1')).rejects.toThrow(NotFoundException);
  });

  it('renames the account with a trimmed name', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'account-1', name: 'Acme' }] }),
    };
    const service = new AccountService(database as never);

    await expect(service.rename('account-1', ' Acme ')).resolves.toMatchObject({
      name: 'Acme',
    });
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE accounts'), [
      'Acme',
      'account-1',
    ]);
  });

  it('rejects a blank account name', async () => {
    const database = { query: vi.fn() };
    const service = new AccountService(database as never);

    await expect(service.rename('account-1', '   ')).rejects.toThrow(BadRequestException);
    expect(database.query).not.toHaveBeenCalled();
  });
});
