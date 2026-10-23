import { z } from 'zod';

/** Env flags arrive as strings; z.coerce.boolean() would read "false" as true. */
const envFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const DatabaseConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.coerce.number().int().positive().default(5432),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  logging: envFlag,
  ssl: envFlag,
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/** Also called directly by the TypeORM CLI data source, outside Nest. */
export function databaseConfig(): DatabaseConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return DatabaseConfigSchema.parse({
    host: process.env.DB_HOST || undefined,
    port: process.env.DB_PORT || undefined,
    username: process.env.DB_USERNAME || undefined,
    password: process.env.DB_PASSWORD || undefined,
    database: process.env.DB_NAME || undefined,
    logging: process.env.DB_LOGGING || undefined,
    ssl: process.env.DB_SSL || undefined,
  });
}
