import { ConsoleLogger, LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/**
 * ConsoleLogger that prints a static message followed by its extras as one JSON object:
 *
 *   logger.log('Run not started: a live run already exists', { workflowId, profileId });
 *   → LOG [TriggerService] Run not started: a live run already exists {"workflowId":"…","profileId":"…"}
 *
 * Messages never interpolate values; variable data goes into the extras object. For errors pass
 * the stack as the last argument: logger.error('Job failed', { jobId }, error.stack).
 */
export class AppLogger extends ConsoleLogger {
  /** level enables itself and everything more severe (warn → error + warn). */
  constructor(level: LogLevel = 'log') {
    super({ logLevels: LEVELS.slice(0, LEVELS.indexOf(level) + 1) });
  }

  protected override printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
    errorStack?: unknown,
  ): void {
    const [message, ...extras] = messages;
    const line =
      extras.length === 0
        ? message
        : `${String(message)} ${JSON.stringify(Object.assign({}, ...extras))}`;
    super.printMessages([line], context, logLevel, writeStreamType, errorStack);
  }
}
