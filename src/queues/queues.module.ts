import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { DefaultJobOptions } from 'bullmq';
import { redisConfig } from '../config/redis.config';
import { QueueProducer } from './queue-producer';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from './queue-names';

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule.forFeature(redisConfig)],
      inject: [redisConfig.KEY],
      useFactory: (config: ConfigType<typeof redisConfig>) => ({ connection: config }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_EVENTS, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: QUEUE_WORKFLOW_STEPS, defaultJobOptions: DEFAULT_JOB_OPTIONS },
      { name: QUEUE_EMAIL_SEND, defaultJobOptions: DEFAULT_JOB_OPTIONS },
    ),
  ],
  providers: [QueueProducer],
  exports: [BullModule, QueueProducer],
})
export class QueuesModule {}
