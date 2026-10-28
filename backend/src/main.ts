import 'reflect-metadata';
import { Logger, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

/** Single process: HTTP API and BullMQ consumers run in the same Nest application. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, abortOnError: false });
  app.useLogger(app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER));
  const config = app
    .get<ConfigService<AppConfig, true>>(ConfigService)
    .get('server', { infer: true });
  app.enableShutdownHooks();
  await app.listen(config.port);
  Logger.log({ message: 'Application started', env: config.env, port: config.port }, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.flush();
  Logger.error(
    { message: 'Application failed to start', error: String(error) },
    error instanceof Error ? error.stack : undefined,
    'Bootstrap',
  );
  process.exit(1);
});
