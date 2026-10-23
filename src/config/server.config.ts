import { z } from 'zod';

export const ServerConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  /** winston level; Nest's log() maps to info. */
  logLevel: z.enum(['error', 'warn', 'info', 'verbose', 'debug']).default('info'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function serverConfig(): ServerConfig {
  return ServerConfigSchema.parse({
    env: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
  });
}
