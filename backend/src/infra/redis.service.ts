import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private inFlightPing?: Promise<void>;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'));
  }

  async healthcheck(timeoutMs = 2_000): Promise<void> {
    this.inFlightPing ??= this.client
      .ping()
      .then(() => undefined)
      .finally(() => {
        this.inFlightPing = undefined;
      });
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.inFlightPing,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Redis health check timed out')),
            timeoutMs
          );
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
