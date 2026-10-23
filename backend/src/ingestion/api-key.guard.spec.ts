import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  it('attaches the owning account for an active key', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ account_id: 'account-1' }] })
    };
    const request = { headers: { 'x-api-key': 'cep_secret' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext;
    const guard = new ApiKeyGuard(database as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toHaveProperty('accountId', 'account-1');
  });

  it('rejects unknown or revoked keys', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    const request = { headers: { 'x-api-key': 'cep_missing' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request })
    } as unknown as ExecutionContext;
    const guard = new ApiKeyGuard(database as never);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
