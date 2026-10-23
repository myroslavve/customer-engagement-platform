import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { envBoolean, parseConfig } from './parse-config';

export const DatabaseConfigSchema = z.object({
  host: z.string().min(1).default('localhost'),
  port: z.coerce.number().int().positive().default(5432),
  username: z.string().min(1),
  password: z.string().min(1),
  database: z.string().min(1),
  logging: envBoolean.default('false'),
  ssl: envBoolean.default('false'),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

/** Also called directly by the TypeORM CLI data source, outside Nest. */
export const databaseConfig = registerAs('database', (): DatabaseConfig =>
  parseConfig('database', DatabaseConfigSchema, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: process.env.DB_LOGGING,
    ssl: process.env.DB_SSL,
  }),
);
