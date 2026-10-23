import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { WinstonModule, utilities as nestWinstonUtilities } from 'nest-winston';
import { format, transports } from 'winston';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { AppConfig, configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MessagingModule } from './messaging/messaging.module';
import { QueuesModule } from './queues/queues.module';
import { WorkflowExecutionModule } from './workflow-execution/workflow-execution.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const { env, logLevel } = configService.get('server', { infer: true });
        return {
          level: logLevel,
          transports: [
            new transports.Console({
              format: format.combine(
                format.timestamp(),
                format.ms(),
                nestWinstonUtilities.format.nestLike('CEP', {
                  colors: env !== 'production',
                  prettyPrint: true,
                }),
              ),
            }),
          ],
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    QueuesModule,
    WorkflowsModule,
    EventProcessingModule,
    WorkflowExecutionModule,
    MessagingModule,
    IngestionModule,
    AuthModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
