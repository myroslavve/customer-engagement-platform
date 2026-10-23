import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AppConfig } from '../config/configuration';
import { DatabaseConfig } from '../config/db.config';
import { Account } from './entities/account.entity';
import { Profile } from './entities/profile.entity';
import { UserEvent } from './entities/user-event.entity';
import { WorkflowRun } from './entities/workflow-run.entity';
import { WorkflowVersion } from './entities/workflow-version.entity';
import { Workflow } from './entities/workflow.entity';

export const ENTITIES = [Account, Profile, UserEvent, Workflow, WorkflowVersion, WorkflowRun];

/** Shared by the application (TypeOrmModule) and the TypeORM CLI (data-source.ts). */
export function buildDataSourceOptions(config: DatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    logging: config.logging,
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
  };
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildDataSourceOptions(configService.get('database', { infer: true })),
    }),
  ],
})
export class DatabaseModule {}
