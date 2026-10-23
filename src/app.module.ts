import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { serverConfig } from './config/server.config';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { QueuesModule } from './queues/queues.module';
import { WorkflowsModule } from './workflows/workflows.module';

/**
 * ConfigModule.forRoot only loads .env; each module registers the config it reads through
 * ConfigModule.forFeature, so nothing has access to another module's settings.
 */
@Module({
  imports: [
    ConfigModule.forRoot(),
    ConfigModule.forFeature(serverConfig),
    DatabaseModule,
    QueuesModule,
    WorkflowsModule,
    EventProcessingModule,
  ],
})
export class AppModule {}
