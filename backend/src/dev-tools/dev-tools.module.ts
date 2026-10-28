import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MessagingModule } from '../messaging/messaging.module';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { DevBootstrapService } from './dev-bootstrap.service';
import { DevFixturesService } from './dev-fixtures.service';
import { DevQueueService } from './dev-queue.service';
import { DevToolsController } from './dev-tools.controller';
import { DevToolsEnabledGuard } from './dev-tools-enabled.guard';
import { DevTriggerService } from './dev-trigger.service';
import { RunInspectorService } from './run-inspector.service';

/** Always registered; DevToolsEnabledGuard turns the routes off outside local development. */
@Module({
  // DatabaseModule: AdminAuthGuard is resolved here and needs AdminDatabaseService.
  imports: [
    DatabaseModule,
    AuthModule,
    AdminModule,
    IngestionModule,
    WorkflowsModule,
    MessagingModule,
    QueuesModule,
  ],
  controllers: [DevToolsController],
  providers: [
    DevToolsEnabledGuard,
    DevFixturesService,
    DevBootstrapService,
    DevTriggerService,
    RunInspectorService,
    DevQueueService,
  ],
})
export class DevToolsModule {}
