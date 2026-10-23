import { LogLevel } from '@nestjs/common';
import { Env } from './env.schema';

const ORDER: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/** Nest expects the list of enabled levels; LOG_LEVEL=warn enables error+warn. */
export function nestLogLevels(level: Env['LOG_LEVEL']): LogLevel[] {
  return ORDER.slice(0, ORDER.indexOf(level) + 1);
}
