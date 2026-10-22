import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.service';
import { QueueService } from '../infra/queue.service';
import { RedisService } from '../infra/redis.service';
import { IdentifyDto, TrackDto } from './ingestion.dto';

@Injectable()
export class IngestionService {
  constructor(
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
    const key = `idempotency:ingestion:${input.messageId}`;
    if (!(await this.redis.client.set(key, '1', 'EX', 86400, 'NX'))) {
      throw new ConflictException('messageId has already been processed');
    }

    try {
      const eventId = await this.database.transaction(async (client) => {
        const profile = await client.query<{ id: string }>(
          `INSERT INTO profiles (external_id, email, traits)
           VALUES ($1, $2, $3)
           ON CONFLICT (external_id) DO UPDATE SET email = COALESCE(EXCLUDED.email, profiles.email),
             traits = profiles.traits || EXCLUDED.traits, updated_at = NOW()
           RETURNING id`,
          [input.userId, input.email ?? null, JSON.stringify(input.traits ?? {})]
        );
        const event = await client.query<{ id: string }>(
          `INSERT INTO events (profile_id, message_id, event_type, payload, occurred_at)
           VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
           ON CONFLICT (message_id) DO UPDATE SET message_id = EXCLUDED.message_id
           RETURNING id`,
          [
            profile.rows[0].id,
            input.messageId,
            type,
            JSON.stringify(input),
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
