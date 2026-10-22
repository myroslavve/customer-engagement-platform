import { LogLevel as NestLogLevel } from '@nestjs/common';
import { LogLevel } from './app-config';

const ORDER: NestLogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/** Nest expects the list of enabled levels; LOG_LEVEL=warn enables error+warn. */
export function nestLogLevels(level: LogLevel): NestLogLevel[] {
  return ORDER.slice(0, ORDER.indexOf(level) + 1);
}
