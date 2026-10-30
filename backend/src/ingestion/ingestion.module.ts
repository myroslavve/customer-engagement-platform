import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventOutbox } from '../database/entities/event-outbox.entity';
import { QueuesModule } from '../queues/queues.module';
import { RedisModule } from '../redis/redis.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ApiKeyGuard } from './api-key.guard';
import { EventOutboxRepository } from './event-outbox.repository';
import { IdempotencyService } from './idempotency.service';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([EventOutbox]), WorkflowsModule, QueuesModule, RedisModule],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IdempotencyService,
    EventOutboxRepository,
    OutboxService,
    ApiKeyGuard,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
