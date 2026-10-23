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
    const guard = new ApiKeyGuard(config as never);

    expect(guard.canActivate(contextFor('cep_secret'))).toBe(true);
  });

  it('rejects an unknown API key', () => {
    const config = { get: vi.fn().mockReturnValue({ apiKey: 'cep_secret' }) };
    const guard = new ApiKeyGuard(config as never);

    expect(() => guard.canActivate(contextFor('cep_missing'))).toThrow(UnauthorizedException);
  });
});
