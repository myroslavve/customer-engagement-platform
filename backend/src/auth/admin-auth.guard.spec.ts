import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuthGuard } from './admin-auth.guard';

function requestContext(token?: string) {
  const request: {
    headers: Record<string, string>;
    user?: unknown;
  } = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const payload = {
  userId: 'user-1',
  accountId: 'account-1',
  email: 'admin@example.com',
  role: 'admin',
  tokenVersion: 2,
};

describe('AdminAuthGuard', () => {
  it('accepts a token whose version matches the database', async () => {
    const jwt = { verify: vi.fn().mockReturnValue(payload) };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ token_version: 2, role: 'admin' }] }),
    };
    const guard = new AdminAuthGuard(jwt as never, database as never);
    const { context, request } = requestContext('token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ userId: 'user-1', tokenVersion: 2 });
  });

  it('accepts a legacy token without a version when the user is at version zero', async () => {
    const jwt = {
      verify: vi.fn().mockReturnValue({ ...payload, tokenVersion: undefined }),
    };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ token_version: 0, role: 'admin' }] }),
    };
    const guard = new AdminAuthGuard(jwt as never, database as never);

    await expect(guard.canActivate(requestContext('token').context)).resolves.toBe(true);
  });

  it('rejects a token after the password version changes', async () => {
    const jwt = { verify: vi.fn().mockReturnValue(payload) };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ token_version: 3, role: 'admin' }] }),
    };
    const guard = new AdminAuthGuard(jwt as never, database as never);

    await expect(guard.canActivate(requestContext('token').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token for a deleted admin', async () => {
    const jwt = { verify: vi.fn().mockReturnValue(payload) };
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const guard = new AdminAuthGuard(jwt as never, database as never);

    await expect(guard.canActivate(requestContext('token').context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing token without querying the database', async () => {
    const jwt = { verify: vi.fn() };
    const database = { query: vi.fn() };
    const guard = new AdminAuthGuard(jwt as never, database as never);

    await expect(guard.canActivate(requestContext().context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects a valid token without the admin role', async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ ...payload, role: 'user' }) };
    const database = { query: vi.fn() };
    const guard = new AdminAuthGuard(jwt as never, database as never);

    await expect(guard.canActivate(requestContext('token').context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(database.query).not.toHaveBeenCalled();
  });
});
