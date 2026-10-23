import { ConflictException, Injectable } from '@nestjs/common';
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
 * outbox row in one transaction) -> enqueue process-event. A failure releases the claim so the
 * client can retry; the outbox re-publishes jobs whose enqueue did not happen.
 */
@Injectable()
export class IngestionService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly idempotencyService: IdempotencyService,
    private readonly profileRepository: ProfileRepository,
    private readonly eventRepository: EventRepository,
    private readonly eventOutboxRepository: EventOutboxRepository,
    private readonly queueProducer: QueueProducer,
  ) {}

  identify(input: IdentifyDto): Promise<IngestionResult> {
    return this.ingest(input, {
      email: input.email ?? null,
      traits: input.traits ?? {},
      eventName: IDENTIFY_EVENT_NAME,
      properties: input.traits ?? {},
    });
  }

  track(input: TrackDto): Promise<IngestionResult> {
    return this.ingest(input, {
      email: null,
      traits: {},
      eventName: input.eventName,
      properties: input.properties ?? {},
    });
  }

  private async ingest(
    input: IngestionDto,
    data: {
      email: string | null;
      traits: Record<string, unknown>;
      eventName: string;
      properties: Record<string, unknown>;
    },
  ): Promise<IngestionResult> {
    const { accountId } = this.configService.get('ingestion', { infer: true });
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

      if (eventId && created) await this.queueProducer.enqueueProcessEvent({ eventId });
      return { accepted: true, eventId };
    } catch (error) {
      await this.idempotencyService.release(accountId, input.messageId);
      throw error;
    }
  }
}
