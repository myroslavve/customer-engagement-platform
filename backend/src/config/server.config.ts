import { z } from 'zod';

export const ServerConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  /** winston level; Nest's log() maps to info. */
  logLevel: z.enum(['error', 'warn', 'info', 'verbose', 'debug']).default('info'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function serverConfig(): ServerConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return ServerConfigSchema.parse({
    env: process.env.NODE_ENV || undefined,
    port: process.env.PORT || undefined,
    logLevel: process.env.LOG_LEVEL || undefined,
  });
}
