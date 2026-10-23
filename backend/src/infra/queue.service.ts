import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly events: Queue;
  private readonly connection: Redis;

  constructor(configService: ConfigService) {
    this.connection = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
    });
    this.events = new Queue('events', {
      connection: this.connection,
      prefix: configService.get<string>('BULLMQ_PREFIX', 'bull'),
    });
  }

  publishProcessEvent(eventId: string): Promise<void> {
    return this.events.add('process-event', { eventId }, { jobId: eventId }).then(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.events.close();
    await this.connection.quit();
  }
}
