import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { QueueProducer } from '../queues/queue-producer';
import { IngestionResult } from '../types/ingestion-result.types';
import { EventRepository } from '../workflows/event.repository';
import { ProfileRepository } from '../workflows/profile.repository';
import { EventOutboxRepository } from './event-outbox.repository';
import { IdempotencyService } from './idempotency.service';
import { IdentifyDto, IngestionDto, TrackDto } from './ingestion.dto';

const IDENTIFY_EVENT_NAME = 'identify';

/**
 * validate (ValidationPipe) -> dedupe (Redis messageId claim) -> persist (profile upsert, event,
 * outbox row in one transaction) -> enqueue process-event -> delete the outbox row. A failure
 * releases the claim so the client can retry; the outbox publisher re-publishes jobs whose enqueue
 * did not happen (crash or Redis failure between commit and enqueue).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly idempotencyService: IdempotencyService,
    private readonly profileRepository: ProfileRepository,
    private readonly eventRepository: EventRepository,
    private readonly eventOutboxRepository: EventOutboxRepository,
    private readonly queueProducer: QueueProducer,
  ) {}

  identify(input: IdentifyDto, accountId?: string): Promise<IngestionResult> {
    return this.ingest(
      input,
      {
        email: input.email ?? null,
        traits: input.traits ?? {},
        eventName: IDENTIFY_EVENT_NAME,
        properties: input.traits ?? {},
      },
      accountId,
    );
  }

  track(input: TrackDto, accountId?: string): Promise<IngestionResult> {
    return this.ingest(
      input,
      {
        email: null,
        traits: {},
        eventName: input.eventName,
        properties: input.properties ?? {},
      },
      accountId,
    );
  }

  private async ingest(
    input: IngestionDto,
    data: {
      email: string | null;
      traits: Record<string, unknown>;
      eventName: string;
      properties: Record<string, unknown>;
    },
    requestedAccountId?: string,
  ): Promise<IngestionResult> {
    const accountId =
      requestedAccountId ?? this.configService.get('ingestion', { infer: true }).accountId;
    if (!(await this.idempotencyService.claim(accountId, input.messageId))) {
      throw new ConflictException('messageId has already been processed');
    }

    try {
      const { eventId, created } = await this.eventRepository.transaction(async (transaction) => {
        const existing = await this.eventRepository.findByMessageId(
          accountId,
          input.messageId,
          transaction,
        );
        if (existing) return { eventId: existing.id, created: false };

        const profileId = await this.profileRepository.upsert(
          { accountId, externalId: input.userId, email: data.email, traits: data.traits },
          transaction,
        );
        const newEventId = await this.eventRepository.createIfAbsent(
          {
            accountId,
            profileId,
            name: data.eventName,
            properties: data.properties,
            messageId: input.messageId,
            occurredAt: input.timestamp ? new Date(input.timestamp) : new Date(),
          },
          transaction,
        );
        if (!newEventId) return { eventId: undefined, created: false };
        await this.eventOutboxRepository.add(newEventId, transaction);
        return { eventId: newEventId, created: true };
      });

      if (eventId && created) {
        await this.queueProducer.enqueueProcessEvent({ eventId });
        await this.removeOutboxEntry(eventId);
      }
      return { accepted: true, eventId };
    } catch (error) {
      await this.idempotencyService.release(accountId, input.messageId);
      throw error;
    }
  }

  /**
   * The job is queued, so the outbox row is no longer needed. Best effort: the event is stored and
   * queued, so a failed delete must not fail the request; the outbox publisher removes it later.
   */
  private async removeOutboxEntry(eventId: string): Promise<void> {
    try {
      await this.eventOutboxRepository.removeByEventId(eventId);
    } catch (error) {
      this.logger.warn({
        message: 'Failed to remove outbox entry after enqueue',
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
