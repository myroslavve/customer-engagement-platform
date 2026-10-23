import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  it('builds account-scoped filtered activity queries', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'event-1' }] })
    };
    const service = new ActivityService(database as never);

    await expect(
      service.list('account-1', {
        profileId: 'profile-1',
        eventName: 'purchase',
        from: '2026-01-01T00:00:00Z',
        limit: 20
      })
    ).resolves.toEqual([{ id: 'event-1' }]);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('e.profile_id = $2'),
      ['account-1', 'profile-1', 'purchase', '2026-01-01T00:00:00Z', 20]
    );
  });

  it('caps requested activity limits', async () => {
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    const service = new ActivityService(database as never);

    await service.list('account-1', { limit: 10_000 });
    expect(database.query.mock.calls[0][1]).toEqual(['account-1', 500]);
  });
});
