import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../infra/database.service';
import { QueueService } from '../infra/queue.service';
import { RedisService } from '../infra/redis.service';
import { IdentifyDto, TrackDto } from './ingestion.dto';

@Injectable()
export class IngestionService {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly queue: QueueService
  ) {}

  identify(input: IdentifyDto, accountId?: string) {
    return this.persist(input, 'identify', accountId);
  }

  track(input: TrackDto, accountId?: string) {
    return this.persist(input, 'track', accountId);
  }

  private async persist(input: IdentifyDto | TrackDto, type: string, requestedAccountId?: string) {
    const accountId =
      requestedAccountId ?? this.config.getOrThrow<string>('INGESTION_ACCOUNT_ID');
    const key = `idempotency:ingestion:${accountId}:${input.messageId}`;
    if (!(await this.redis.client.set(key, '1', 'EX', 86400, 'NX'))) {
      throw new ConflictException('messageId has already been processed');
    }

    try {
      const result = await this.database.transaction(async (client) => {
        const existingEvent = await client.query<{ id: string }>(
          'SELECT id FROM events WHERE account_id = $1 AND message_id = $2',
          [accountId, input.messageId]
        );
        if (existingEvent.rows[0]) {
          return { eventId: existingEvent.rows[0].id, created: false };
        }
        const profile = await client.query<{ id: string }>(
          `INSERT INTO profiles (account_id, external_id, email, traits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (account_id, external_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, profiles.email),
             traits = profiles.traits || EXCLUDED.traits, updated_at = NOW()
           RETURNING id`,
          [
            accountId,
            input.userId,
            'email' in input ? input.email ?? null : null,
            JSON.stringify('traits' in input ? input.traits ?? {} : {})
          ]
        );
        const event = await client.query<{ id: string }>(
          `INSERT INTO events (account_id, profile_id, name, properties, message_id, occurred_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
           ON CONFLICT (account_id, message_id) WHERE message_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [
            accountId,
            profile.rows[0].id,
            type === 'track' ? (input as TrackDto).eventName : 'identify',
            JSON.stringify(
              type === 'track'
                ? (input as TrackDto).properties ?? {}
                : 'traits' in input
                  ? input.traits ?? {}
                  : {}
            ),
            input.messageId,
            input.timestamp ?? null
          ]
        );
        if (!event.rows[0]) return { eventId: undefined, created: false };
        await client.query(
          'INSERT INTO event_outbox (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING',
          [event.rows[0].id]
        );
        return { eventId: event.rows[0].id, created: true };
      });
      if (!result.eventId || !result.created) {
        return { accepted: true, eventId: result.eventId };
      }
      await this.queue.publishProcessEvent(result.eventId);
      return { accepted: true, eventId: result.eventId };
    } catch (error) {
      await this.redis.client.del(key);
      throw error;
    }
  }
}
