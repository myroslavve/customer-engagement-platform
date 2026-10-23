import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { TemplateController } from './admin/template.controller';
import { TemplateService } from './admin/template.service';
import { AudienceController } from './admin/audience.controller';
import { AudienceService } from './admin/audience.service';
import { WorkflowController } from './admin/workflow.controller';
import { WorkflowService } from './admin/workflow.service';
import { ActivityController } from './admin/activity.controller';
import { ActivityService } from './admin/activity.service';
import { HealthController } from './health/health.controller';
import { DatabaseService } from './infra/database.service';
import { QueueService } from './infra/queue.service';
import { RedisService } from './infra/redis.service';
import { OutboxService } from './infra/outbox.service';
import { IngestionController } from './ingestion/ingestion.controller';
import { IngestionService } from './ingestion/ingestion.service';
import { ApiKeyGuard } from './ingestion/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])
  ],
  controllers: [
    HealthController,
    IngestionController,
    AdminAuthController,
    TemplateController,
    AudienceController,
    WorkflowController,
    ActivityController
  ],
  providers: [
    DatabaseService,
    RedisService,
    QueueService,
    OutboxService,
    IngestionService,
    ApiKeyGuard,
    AdminAuthService,
    AdminAuthGuard,
    TemplateService,
    AudienceService,
    WorkflowService,
    ActivityService,
    { provide: APP_GUARD, useClass: ThrottlerGuard }
  ]
})
export class AppModule {}
