import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { parseConfig } from './parse-config';

export const ServerConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  logLevel: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const serverConfig = registerAs('server', (): ServerConfig =>
  parseConfig('server', ServerConfigSchema, {
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
  }),
);
