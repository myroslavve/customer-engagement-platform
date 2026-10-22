import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { AdminApiController } from './admin/admin-api.controller';
import { HealthController } from './health/health.controller';
import { DatabaseService } from './infra/database.service';
import { QueueService } from './infra/queue.service';
import { RedisService } from './infra/redis.service';
import { IngestionController } from './ingestion/ingestion.controller';
import { IngestionService } from './ingestion/ingestion.service';
import { ApiKeyGuard } from './ingestion/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true })
  ],
  controllers: [
    HealthController,
    IngestionController,
    AdminAuthController,
    AdminApiController
  ],
  providers: [
    DatabaseService,
    RedisService,
    QueueService,
    IngestionService,
    ApiKeyGuard,
    AdminAuthGuard
  ]
})
export class AppModule {}
