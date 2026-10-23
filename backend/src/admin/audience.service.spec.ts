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

  it('rejects rule leaves whose operator has no usable value', async () => {
    const service = new AudienceService({ query: vi.fn() } as never);

    await expect(
      service.preview('account-1', { field: 'traits.plan', op: 'in', value: 'pro' }),
    ).rejects.toThrow('requires an array value');
    await expect(
      service.preview('account-1', { field: 'traits.age', op: 'gt', value: true }),
    ).rejects.toThrow('requires a number or string value');
    await expect(service.preview('account-1', { field: 'traits.plan', op: 'eq' })).rejects.toThrow(
      'requires a value',
    );
  });

  it('rejects fields outside the profile and event namespaces', async () => {
    const service = new AudienceService({ query: vi.fn() } as never);

    await expect(
      service.preview('account-1', { field: 'cart.total', op: 'gt', value: 1 }),
    ).rejects.toThrow('Unsupported audience rule field root "cart"');
  });

  it('matches profiles through their events when the rule references them', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'profile-1',
              external_id: 'one',
              email: 'one@example.com',
              traits: { plan: 'free' },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              profile_id: 'profile-1',
              id: 'event-1',
              name: 'purchased',
              properties: { plan: 'pro' },
              occurred_at: new Date('2026-01-01T00:00:00Z'),
            },
          ],
        }),
    };
    const service = new AudienceService(database as never);

    await expect(
      service.preview('account-1', {
        all: [
          { field: 'traits.plan', op: 'eq', value: 'free' },
          { field: 'event.name', op: 'eq', value: 'purchased' },
        ],
      }),
    ).resolves.toEqual({ count: 1 });
    expect(database.query.mock.calls[1][0]).toContain('FROM events');
  });

  it('keeps the single-query scan for profile-only rules', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: 'profile-1', external_id: 'one', email: null, traits: { plan: 'pro' } }],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const service = new AudienceService(database as never);

    await expect(
      service.preview('account-1', { field: 'traits.plan', op: 'eq', value: 'pro' }),
    ).resolves.toEqual({ count: 1 });
    expect(database.query).toHaveBeenCalledTimes(1);
  });
});
