import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Env } from './config/env.schema';
import { AppLogger } from './logging/app-logger';

/** Single process: HTTP API and BullMQ consumers run in the same Nest application. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(),
    bufferLogs: true,
    abortOnError: false,
  });
  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  app.useLogger(new AppLogger(configService.get('LOG_LEVEL', { infer: true })));
  app.enableShutdownHooks();
  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    'Application started',
    { env: configService.get('NODE_ENV', { infer: true }), port },
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  Logger.flush();
  Logger.error(
    'Application failed to start',
    { error: error instanceof Error ? error.message : String(error) },
    error instanceof Error ? error.stack : undefined,
    'Bootstrap',
  );
  process.exit(1);
});
