import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuthService } from './admin-auth.service';

const PASSWORD_HASH = '$2b$04$BArz8aDmtenAzDO/o4ufR.JZeY6RE5wSxdnaO3UG0cg/9dg/VG0zy';

describe('AdminAuthService', () => {
  it('creates a JWT for a valid database user and records the login', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'user-1',
            account_id: 'account-1',
            email: 'admin@example.com',
            password_hash: PASSWORD_HASH,
            role: 'admin',
            token_version: 3,
          },
        ],
      }),
    };
    const jwt = { sign: vi.fn().mockReturnValue('token') };
    const service = new AdminAuthService(database as never, jwt as never);

    await expect(
      service.login({ email: 'admin@example.com', password: 'password' }),
    ).resolves.toEqual({ accessToken: 'token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', role: 'admin', tokenVersion: 3 }),
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('SET last_login_at = NOW()'),
      ['user-1'],
    );
  });

  it('rejects invalid credentials without revealing whether the email exists', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new AdminAuthService(database as never, { sign: vi.fn() } as never);

    await expect(
      service.login({ email: 'missing@example.com', password: 'password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('registers an account and its first admin in one transaction', async () => {
    const queryRunner = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 'account-1', name: 'Acme', created_at: 'now', updated_at: 'now' },
        ])
        .mockResolvedValueOnce([
          {
            id: 'user-1',
            account_id: 'account-1',
            email: 'owner@example.com',
            role: 'admin',
            token_version: 0,
          },
        ]),
    };
    const database = { transaction: vi.fn(async (callback) => callback(queryRunner)) };
    const jwt = { sign: vi.fn().mockReturnValue('token') };
    const service = new AdminAuthService(database as never, jwt as never);

    await expect(
      service.register({
        accountName: ' Acme ',
        email: 'owner@example.com',
        password: 'password',
      }),
    ).resolves.toEqual({
      accessToken: 'token',
      account: { id: 'account-1', name: 'Acme', created_at: 'now', updated_at: 'now' },
    });
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO accounts'),
      ['Acme'],
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', tokenVersion: 0 }),
    );
  });

  it('rejects a blank account name at registration', async () => {
    const service = new AdminAuthService({} as never, { sign: vi.fn() } as never);

    await expect(
      service.register({
        accountName: '   ',
        email: 'owner@example.com',
        password: 'password',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps a duplicate registration email to a conflict', async () => {
    const database = {
      transaction: vi.fn().mockRejectedValue({ code: '23505' }),
    };
    const service = new AdminAuthService(database as never, { sign: vi.fn() } as never);

    await expect(
      service.register({
        accountName: 'Acme',
        email: 'owner@example.com',
        password: 'password',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('changes the password and returns a token with the bumped version', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ password_hash: PASSWORD_HASH }] })
        .mockResolvedValueOnce({ rows: [{ token_version: 4 }] }),
    };
    const jwt = { sign: vi.fn().mockReturnValue('new-token') };
    const service = new AdminAuthService(database as never, jwt as never);

    await expect(
      service.changePassword(
        {
          userId: 'user-1',
          accountId: 'account-1',
          email: 'admin@example.com',
          role: 'admin',
          tokenVersion: 3,
        },
        'password',
        'new-password',
      ),
    ).resolves.toEqual({ accessToken: 'new-token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', tokenVersion: 4 }),
    );
  });

  it('rejects a password change with the wrong current password', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ password_hash: PASSWORD_HASH }] }),
    };
    const service = new AdminAuthService(database as never, { sign: vi.fn() } as never);

    await expect(
      service.changePassword(
        {
          userId: 'user-1',
          accountId: 'account-1',
          email: 'admin@example.com',
          role: 'admin',
          tokenVersion: 3,
        },
        'wrong-password',
        'new-password',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns the raw API key only when it is created', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'key-1', name: 'Production', key_prefix: 'cep_abc', created_at: 'now' }],
      }),
    };
    const service = new AdminAuthService(database as never, { sign: vi.fn() } as never);

    const result = await service.createApiKey('account-1', 'Production');

    expect(result).toMatchObject({ id: 'key-1', name: 'Production' });
    expect(result.key).toMatch(/^cep_/);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_keys'),
      expect.arrayContaining(['account-1', 'Production']),
    );
  });
});
