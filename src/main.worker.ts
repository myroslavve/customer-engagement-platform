import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppConfig } from './config/app-config';
import { nestLogLevels } from './config/log-levels';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const config = AppConfig.fromEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: nestLogLevels(config.logLevel),
  });
  app.enableShutdownHooks();
  Logger.log(`Worker started (env=${config.nodeEnv})`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    'Bootstrap',
  );
  process.exit(1);
});
