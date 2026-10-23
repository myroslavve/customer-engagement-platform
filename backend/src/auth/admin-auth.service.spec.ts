import { describe, expect, it, vi } from 'vitest';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  it('creates a JWT for a valid database user', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{
          id: 'user-1',
          account_id: 'account-1',
          email: 'admin@example.com',
          password_hash: '$2b$04$BArz8aDmtenAzDO/o4ufR.JZeY6RE5wSxdnaO3UG0cg/9dg/VG0zy',
          role: 'admin'
        }]
      })
    };
    const jwt = { sign: vi.fn().mockReturnValue('token') };
    const service = new AdminAuthService(
      database as never,
      jwt as never,
    );

    await expect(
      service.login({ email: 'admin@example.com', password: 'password' })
    ).resolves.toEqual({ accessToken: 'token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account-1', role: 'admin' })
    );
  });

  it('returns the raw API key only when it is created', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'key-1', name: 'Production', key_prefix: 'cep_abc', created_at: 'now' }]
      })
    };
    const service = new AdminAuthService(
      database as never,
      { sign: vi.fn() } as never
    );

    const result = await service.createApiKey('account-1', 'Production');

    expect(result).toMatchObject({ id: 'key-1', name: 'Production' });
    expect(result.key).toMatch(/^cep_/);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_keys'),
      expect.arrayContaining(['account-1', 'Production'])
    );
  });
});
