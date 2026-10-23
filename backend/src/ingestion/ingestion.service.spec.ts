import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  it('persists an event and publishes its ID for processing', async () => {
    const database = {
      transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          query: jest
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
            .mockResolvedValueOnce({ rows: [] })
        })
      )
    };
    const redis = {
      client: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() }
    };
    const queue = { publishProcessEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new IngestionService(
      { getOrThrow: jest.fn().mockReturnValue('account-1') } as never,
      database as never,
      redis as never,
      queue as never
    );

    await expect(
      service.identify({
        userId: 'user-1',
        messageId: 'message-1',
        traits: { plan: 'pro' }
      })
    ).resolves.toEqual({ accepted: true, eventId: 'event-1' });

    expect(queue.publishProcessEvent).toHaveBeenCalledWith('event-1');
  });

  it('removes the idempotency key when persistence or queueing fails', async () => {
    const database = {
      transaction: jest.fn().mockRejectedValue(new Error('database unavailable'))
    };
    const redis = {
      client: { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() }
    };
    const queue = { publishProcessEvent: jest.fn() };
    const service = new IngestionService(
      { getOrThrow: jest.fn().mockReturnValue('account-1') } as never,
      database as never,
      redis as never,
      queue as never
    );

    await expect(
      service.identify({ userId: 'user-1', messageId: 'message-1' })
    ).rejects.toThrow('database unavailable');
    expect(redis.client.del).toHaveBeenCalledWith(
      'idempotency:ingestion:account-1:message-1'
    );
  });

  it('rejects a duplicate message before touching the database', async () => {
    const database = { transaction: jest.fn() };
    const redis = {
      client: { set: jest.fn().mockResolvedValue(null), del: jest.fn() }
    };
    const queue = { publishProcessEvent: jest.fn() };
    const service = new IngestionService(
      { getOrThrow: jest.fn().mockReturnValue('account-1') } as never,
      database as never,
      redis as never,
      queue as never
    );

    await expect(
      service.identify({ userId: 'user-1', messageId: 'message-1' })
    ).rejects.toThrow('messageId has already been processed');
    expect(database.transaction).not.toHaveBeenCalled();
  });
});
