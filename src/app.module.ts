import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { QueuesModule } from './queues/queues.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    QueuesModule,
    WorkflowsModule,
    EventProcessingModule,
  ],
})
export class AppModule {}
