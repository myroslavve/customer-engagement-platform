import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { QueuesModule } from './queues/queues.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [ConfigModule, DatabaseModule, QueuesModule, WorkflowsModule, EventProcessingModule],
})
export class WorkerModule {}
