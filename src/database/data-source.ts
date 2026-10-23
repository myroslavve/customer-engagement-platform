import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { envSchema } from '../config/env.schema';
import { buildDataSourceOptions } from './database.module';

/** TypeORM CLI entry (migration:run / revert / generate); the application uses DatabaseModule. */
export default new DataSource(buildDataSourceOptions(envSchema.parse(process.env).DATABASE_URL));
