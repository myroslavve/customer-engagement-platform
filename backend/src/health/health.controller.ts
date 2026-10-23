import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

const CHECK_TIMEOUT_MS = 2_000;

type HealthStatus = { status: string; database: string; redis: string };

@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthStatus> {
    const [databaseResult, redisResult] = await Promise.allSettled([
      this.withTimeout(this.dataSource.query('SELECT 1'), 'Database health check timed out'),
      this.redisService.healthcheck(CHECK_TIMEOUT_MS),
    ]);
    const database = databaseResult.status === 'fulfilled' ? 'ok' : 'unavailable';
    const redis = redisResult.status === 'fulfilled' ? 'ok' : 'unavailable';
    if (database === 'unavailable' || redis === 'unavailable') {
      this.logger.error({
        message: 'Dependency health check failed',
        database,
        redis,
        databaseError: databaseResult.status === 'rejected' ? reason(databaseResult) : undefined,
        redisError: redisResult.status === 'rejected' ? reason(redisResult) : undefined,
      });
      throw new ServiceUnavailableException({ status: 'unavailable', database, redis });
    }
    return { status: 'ok', database, redis };
  }

  /** A stalled check (exhausted pool, dropped packets) must fail the probe, not hang it. */
  private async withTimeout<T>(check: Promise<T>, timeoutMessage: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        check,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), CHECK_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function reason(result: PromiseRejectedResult): string {
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}
