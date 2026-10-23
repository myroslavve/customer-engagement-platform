import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Env } from './config/env.schema';
import { nestLogLevels } from './config/log-levels';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
    abortOnError: false,
  });
  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  app.useLogger(
    new ConsoleLogger({
      logLevels: nestLogLevels(configService.get('LOG_LEVEL', { infer: true })),
    }),
  );
  app.enableShutdownHooks();
  Logger.log(`Worker started (env=${configService.get('NODE_ENV', { infer: true })})`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.flush();
  Logger.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
    'Bootstrap',
  );
  process.exit(1);
});
