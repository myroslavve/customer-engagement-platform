import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from './ingestion.service';

function createService(overrides: { claimed?: boolean; transactionError?: Error } = {}) {
  const transaction = {};
  const configService = { get: vi.fn().mockReturnValue({ accountId: 'account-1' }) };
  const idempotencyService = {
    claim: vi.fn().mockResolvedValue(overrides.claimed ?? true),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const eventRepository = {
    transaction: overrides.transactionError
      ? vi.fn().mockRejectedValue(overrides.transactionError)
      : vi.fn().mockImplementation((work: (tx: object) => Promise<unknown>) => work(transaction)),
    findByMessageId: vi.fn().mockResolvedValue(null),
    createIfAbsent: vi.fn().mockResolvedValue('event-1'),
  };
  const profileRepository = { upsert: vi.fn().mockResolvedValue('profile-1') };
  const eventOutboxRepository = { add: vi.fn().mockResolvedValue(undefined) };
  const queueProducer = { enqueueProcessEvent: vi.fn().mockResolvedValue(undefined) };
  const service = new IngestionService(
    configService as never,
    idempotencyService as never,
    profileRepository as never,
    eventRepository as never,
    eventOutboxRepository as never,
    queueProducer as never,
  );
  return {
    service,
    transaction,
    idempotencyService,
    eventRepository,
    profileRepository,
    eventOutboxRepository,
    queueProducer,
  };
}

describe('IngestionService', () => {
  it('persists an event and publishes its ID for processing', async () => {
    const { service, transaction, profileRepository, eventOutboxRepository, queueProducer } =
      createService();

    await expect(
      service.identify({ userId: 'user-1', messageId: 'message-1', traits: { plan: 'pro' } }),
    ).resolves.toEqual({ accepted: true, eventId: 'event-1' });

    expect(profileRepository.upsert).toHaveBeenCalledWith(
      { accountId: 'account-1', externalId: 'user-1', email: null, traits: { plan: 'pro' } },
      transaction,
    );
    expect(eventOutboxRepository.add).toHaveBeenCalledWith('event-1', transaction);
    expect(queueProducer.enqueueProcessEvent).toHaveBeenCalledWith({ eventId: 'event-1' });
  });

  it('releases the idempotency claim when persistence or queueing fails', async () => {
    const { service, idempotencyService } = createService({
      transactionError: new Error('database unavailable'),
    });

    await expect(service.identify({ userId: 'user-1', messageId: 'message-1' })).rejects.toThrow(
      'database unavailable',
    );
    expect(idempotencyService.release).toHaveBeenCalledWith('account-1', 'message-1');
  });

  it('rejects a duplicate message before touching the database', async () => {
    const { service, eventRepository } = createService({ claimed: false });

    await expect(
      service.identify({ userId: 'user-1', messageId: 'message-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(eventRepository.transaction).not.toHaveBeenCalled();
  });
});
