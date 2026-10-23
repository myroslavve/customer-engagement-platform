import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AudienceService, AudienceRule } from './audience.service';

describe('AudienceService', () => {
  it('counts profiles matching nested trait rules', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'profile-1',
            external_id: 'one',
            email: 'one@example.com',
            traits: { plan: 'pro' },
          },
          {
            id: 'profile-2',
            external_id: 'two',
            email: 'two@example.com',
            traits: { plan: 'free' },
          },
        ],
      }),
    };
    const service = new AudienceService(database as never);
    const rule: AudienceRule = {
      all: [
        { field: 'traits.plan', op: 'eq', value: 'pro' },
        { field: 'email', op: 'exists' },
      ],
    };

    await expect(service.preview('account-1', rule)).resolves.toEqual({ count: 1 });
    expect(database.query).toHaveBeenCalledWith(
      'SELECT id, external_id, email, traits FROM profiles WHERE account_id = $1',
      ['account-1'],
    );
  });

  it('rejects empty audience groups', async () => {
    const service = new AudienceService({ query: vi.fn() } as never);

    await expect(service.preview('account-1', { any: [] })).rejects.toThrow(BadRequestException);
  });
});
