import { IngestionService } from './ingestion.service';

describe('IngestionService', () => {
  it('persists an event and publishes its ID for processing', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
    };
    const redis = { client: { set: jest.fn().mockResolvedValue('OK') } };
    const queue = { publishProcessEvent: jest.fn().mockResolvedValue(undefined) };
    const service = new IngestionService(
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
});
