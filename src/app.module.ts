import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule, utilities as nestWinstonUtilities } from 'nest-winston';
import { format, transports } from 'winston';
import { AppConfig, configuration } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EventProcessingModule } from './event-processing/event-processing.module';
import { QueuesModule } from './queues/queues.module';
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
    DatabaseModule,
    QueuesModule,
    WorkflowsModule,
    EventProcessingModule,
  ],
})
export class AppModule {}
