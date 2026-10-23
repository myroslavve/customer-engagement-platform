import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DefaultJobOptions } from 'bullmq';
import { AppConfig } from '../config/configuration';
import { QueueConfig } from '../config/queue.config';
import { QueueProducer } from './queue-producer';
import { QUEUE_NAMES } from './queue-names';

const JOB_RETENTION: DefaultJobOptions = {
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

function buildDefaultJobOptions(config: QueueConfig): DefaultJobOptions {
  return {
    attempts: config.jobAttempts,
    backoff: { type: 'exponential', delay: config.backoffDelayMs },
    ...JOB_RETENTION,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        connection: configService.get('redis', { infer: true }),
      }),
    }),
    BullModule.registerQueueAsync(
      ...QUEUE_NAMES.map((name) => ({
        name,
        inject: [ConfigService],
        useFactory: (configService: ConfigService<AppConfig, true>) => ({
          defaultJobOptions: buildDefaultJobOptions(configService.get('queue', { infer: true })),
        }),
      })),
    ),
  ],
  providers: [QueueProducer],
  exports: [BullModule, QueueProducer],
})
export class QueuesModule {}
