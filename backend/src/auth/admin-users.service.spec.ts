import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  it('lists admins scoped to the account', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'user-1', email: 'a@example.com' }] }),
    };
    const service = new AdminUsersService(database as never);

    await expect(service.list('account-1')).resolves.toEqual([
      { id: 'user-1', email: 'a@example.com' },
    ]);
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('WHERE account_id = $1'), [
      'account-1',
    ]);
  });

  it('creates an admin with a hashed password', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'user-2', email: 'b@example.com' }] }),
    };
    const service = new AdminUsersService(database as never);

    await expect(
      service.create('account-1', { email: ' b@example.com ', password: 'password' }),
    ).resolves.toEqual({ id: 'user-2', email: 'b@example.com' });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO admin_users'),
      ['account-1', 'b@example.com', expect.not.stringMatching(/^password$/)],
    );
  });

  it('maps a duplicate email to a conflict', async () => {
    const database = { query: vi.fn().mockRejectedValue({ code: '23505' }) };
    const service = new AdminUsersService(database as never);

    await expect(
      service.create('account-1', { email: 'a@example.com', password: 'password' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a password reset for an admin outside the account', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new AdminUsersService(database as never);

    await expect(service.resetPassword('account-1', 'user-2', 'new-password')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('prevents an admin from deleting themselves', async () => {
    const database = { transaction: vi.fn() };
    const service = new AdminUsersService(database as never);

    await expect(service.remove('account-1', 'user-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('prevents deleting the last admin', async () => {
    const queryRunner = {
      query: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([{ count: 1 }]),
    };
    const database = { transaction: vi.fn(async (callback) => callback(queryRunner)) };
    const service = new AdminUsersService(database as never);

    await expect(service.remove('account-1', 'user-1', 'user-2')).rejects.toThrow(
      ConflictException,
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM admin_users'),
      expect.anything(),
    );
  });

  it('deletes another admin when the account keeps at least one', async () => {
    const queryRunner = {
      query: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'user-1', role: 'admin' }])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([]),
    };
    const database = { transaction: vi.fn(async (callback) => callback(queryRunner)) };
    const service = new AdminUsersService(database as never);

    await expect(service.remove('account-1', 'user-1', 'user-2')).resolves.toBeUndefined();
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM admin_users'),
      ['user-1', 'account-1'],
    );
  });
});
