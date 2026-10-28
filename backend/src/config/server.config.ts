import { z } from 'zod';

/** Env flags arrive as strings; z.coerce.boolean() would read "false" as true. */
const envFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const ServerConfigSchema = z
  .object({
    env: z.enum(['development', 'test', 'production']).default('development'),
    port: z.coerce.number().int().positive().default(3000),
    /** winston level; Nest's log() maps to info. */
    logLevel: z.enum(['error', 'warn', 'info', 'verbose', 'debug']).default('info'),
    /** /dev/* routes (bootstrap, run inspection, fast-forward); local use only. */
    devToolsEnabled: envFlag,
  })
  .refine((config) => !(config.devToolsEnabled && config.env === 'production'), {
    message: 'DEV_TOOLS_ENABLED must not be true when NODE_ENV=production',
    path: ['devToolsEnabled'],
  });

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export function serverConfig(): ServerConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return ServerConfigSchema.parse({
    env: process.env.NODE_ENV || undefined,
    port: process.env.PORT || undefined,
    logLevel: process.env.LOG_LEVEL || undefined,
    devToolsEnabled: process.env.DEV_TOOLS_ENABLED || undefined,
  });
}
