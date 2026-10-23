import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { QueuesModule } from './queues/queues.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    DatabaseModule,
    QueuesModule,
    WorkflowsModule,
    EventProcessingModule,
  ],
})
export class WorkerModule {}
