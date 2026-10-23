import { authConfig } from './auth.config';
import { databaseConfig } from './db.config';
import { ingestionConfig } from './ingestion.config';
import { queueConfig } from './queue.config';
import { redisConfig } from './redis.config';
import { serverConfig } from './server.config';

/** Loaded once into ConfigModule; read with ConfigService<AppConfig, true>.get('database', { infer: true }). */
export function configuration() {
  return {
    server: serverConfig(),
    database: databaseConfig(),
    redis: redisConfig(),
    queue: queueConfig(),
    ingestion: ingestionConfig(),
    auth: authConfig(),
  };
}

export type AppConfig = ReturnType<typeof configuration>;
