import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const CLAIM_TTL_SECONDS = 24 * 60 * 60;

/** Account-scoped messageId claims in Redis, so a client retry is not ingested twice. */
@Injectable()
export class IdempotencyService {
  constructor(private readonly redisService: RedisService) {}

  /** Atomically claims the messageId for 24 h; false when it was already claimed. */
  async claim(accountId: string, messageId: string): Promise<boolean> {
    const result = await this.redisService.client.set(
      this.key(accountId, messageId),
      '1',
      'EX',
      CLAIM_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  /** Frees the claim so the client can retry after a failed ingestion. */
  async release(accountId: string, messageId: string): Promise<void> {
    await this.redisService.client.del(this.key(accountId, messageId));
  }

  private key(accountId: string, messageId: string): string {
    return `idempotency:ingestion:${accountId}:${messageId}`;
  }
}
