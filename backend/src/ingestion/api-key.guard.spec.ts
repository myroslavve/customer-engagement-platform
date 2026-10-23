import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyGuard } from './api-key.guard';

function contextFor(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: key ? { 'x-api-key': key } : {} }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  it('accepts the configured API key', () => {
    const config = { get: vi.fn().mockReturnValue({ apiKey: 'cep_secret' }) };
    const guard = new ApiKeyGuard(config as never, {} as never);

    expect(guard.canActivate(contextFor('cep_secret'))).toBe(true);
  });

  it('rejects an unknown API key', async () => {
    const config = { get: vi.fn().mockReturnValue({ apiKey: 'cep_secret' }) };
    const guard = new ApiKeyGuard(
      config as never,
      {
        query: vi.fn().mockResolvedValue([]),
      } as never,
    );

    await expect(guard.canActivate(contextFor('cep_missing'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts an active database API key and sets its account', async () => {
    const config = { get: vi.fn().mockReturnValue({ apiKey: 'cep_secret' }) };
    const database = {
      query: vi.fn().mockResolvedValue([{ account_id: 'account-db' }]),
    };
    const request: { headers: { 'x-api-key': string }; accountId?: string } = {
      headers: { 'x-api-key': 'cep_database' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new ApiKeyGuard(config as never, database as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.accountId).toBe('account-db');
  });
});
