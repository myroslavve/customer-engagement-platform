import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AppLogger } from './logging/app-logger';

/** Single process: HTTP API and BullMQ consumers run in the same Nest application. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new AppLogger(),
    bufferLogs: true,
    abortOnError: false,
  });
  const config = app
    .get<ConfigService<AppConfig, true>>(ConfigService)
    .get('server', { infer: true });
  app.useLogger(new AppLogger(config.logLevel));
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log('Application started', { env: config.env, port: config.port }, 'Bootstrap');
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
