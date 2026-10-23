import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../infra/database.service';
import { RedisService } from '../infra/redis.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async getHealth(): Promise<{ status: string; database: string; redis: string }> {
    try {
      const results = await Promise.allSettled([
        this.database.healthcheck(),
        this.redis.healthcheck(2_000)
      ]);
      const database = results[0].status === 'fulfilled' ? 'ok' : 'unavailable';
      const redis = results[1].status === 'fulfilled' ? 'ok' : 'unavailable';
      if (database === 'unavailable' || redis === 'unavailable') {
        this.logger.error({
          message: 'Dependency health check failed',
          database,
          redis
        });
        throw new ServiceUnavailableException({ status: 'unavailable', database, redis });
      }
      return { status: 'ok', database, redis };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'unknown',
        redis: 'unknown'
      });
    }
  }
}
