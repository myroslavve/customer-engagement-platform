import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RedisService } from './redis.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly events: Queue;

  constructor(config: ConfigService, redis: RedisService) {
    this.events = new Queue('events', {
      connection: redis.client,
      prefix: config.get<string>('BULLMQ_PREFIX', 'cep')
    });
  }

  publishProcessEvent(eventId: string): Promise<void> {
    return this.events.add('process-event', { eventId }, { jobId: eventId }).then(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.events.close();
  }
}
