import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(configService: ConfigService) {
    this.pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 2_000,
      statement_timeout: 2_000
    });
    this.pool.on('error', (error) => {
      this.logger.error(
        { message: 'Idle PostgreSQL client error', error: error.message },
        error.stack
      );
    });
  }

  query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseError = rollbackError as Error;
        this.logger.error(
          { message: 'ROLLBACK failed', error: releaseError.message },
          releaseError.stack
        );
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }

  async healthcheck(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
