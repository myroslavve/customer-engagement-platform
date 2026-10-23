import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseConfig } from '../config/db.config';
import { buildDataSourceOptions } from './database.module';

/** TypeORM CLI entry (migration:run / revert / generate); the application uses DatabaseModule. */
export default new DataSource(buildDataSourceOptions(databaseConfig()));
