import { databaseConfig } from './db.config';
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
  };
}

export type AppConfig = ReturnType<typeof configuration>;
