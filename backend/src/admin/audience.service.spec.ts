import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AudienceService, AudienceRule } from './audience.service';

describe('AudienceService', () => {
  it('counts profiles matching nested trait rules', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
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
        })
        .mockResolvedValueOnce({ rows: [] }),
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
      expect.stringContaining('ORDER BY id ASC LIMIT $2'),
      ['account-1', 1000],
    );
  });

  it('rejects empty audience groups', async () => {
    const service = new AudienceService({ query: vi.fn() } as never);

    await expect(service.preview('account-1', { any: [] })).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported operators before querying profiles', async () => {
    const database = { query: vi.fn() };
    const service = new AudienceService(database as never);

    await expect(service.preview('account-1', { field: 'email', op: 'bogus' })).rejects.toThrow(
      'Unsupported audience operator',
    );
    expect(database.query).not.toHaveBeenCalled();
  });

  it('maps duplicate names to a conflict', async () => {
    const database = {
      query: vi.fn().mockRejectedValueOnce({ code: '23505' }),
    };
    const service = new AudienceService(database as never);

    await expect(
      service.create('account-1', {
        name: 'Paying users',
        rule: { field: 'traits.plan', op: 'eq', value: 'pro' },
      }),
    ).rejects.toThrow(ConflictException);
  });
});
