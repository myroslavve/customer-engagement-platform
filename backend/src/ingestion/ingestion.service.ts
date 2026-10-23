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

  identify(input: IdentifyDto) {
    return this.persist(input, 'identify');
  }

  track(input: TrackDto) {
    return this.persist(input, 'track');
  }

  private async persist(input: IdentifyDto | TrackDto, type: string) {
    const accountId = this.config.getOrThrow<string>('INGESTION_ACCOUNT_ID');
    const key = `idempotency:ingestion:${accountId}:${input.messageId}`;
    if (!(await this.redis.client.set(key, '1', 'EX', 86400, 'NX'))) {
      throw new ConflictException('messageId has already been processed');
    }

    try {
      const eventId = await this.database.transaction(async (client) => {
        const profile = await client.query<{ id: string }>(
          `INSERT INTO profiles (account_id, external_id, email, traits)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (account_id, external_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, profiles.email),
             traits = profiles.traits || EXCLUDED.traits, updated_at = NOW()
           RETURNING id`,
          [
            accountId,
            input.userId,
            input.email ?? null,
            JSON.stringify(input.traits ?? {})
          ]
        );
        const event = await client.query<{ id: string }>(
          `INSERT INTO events (account_id, profile_id, name, properties, message_id, occurred_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
           ON CONFLICT (account_id, message_id) WHERE message_id IS NOT NULL
           DO UPDATE SET message_id = EXCLUDED.message_id
           RETURNING id`,
          [
            accountId,
            profile.rows[0].id,
            type === 'track' ? (input as TrackDto).eventName : 'identify',
            JSON.stringify(
              type === 'track'
                ? (input as TrackDto).properties ?? {}
                : input.traits ?? {}
            ),
            input.messageId,
            input.timestamp ?? null
          ]
        );
        return event.rows[0].id;
      });
      await this.queue.publishProcessEvent(eventId);
      return { accepted: true, eventId };
    } catch (error) {
      await this.redis.client.del(key);
      throw error;
    }
  }
}
