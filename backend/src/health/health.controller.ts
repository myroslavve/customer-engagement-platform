import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

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
      this.dataSource.query('SELECT 1'),
      this.redisService.healthcheck(2_000),
    ]);
    const database = databaseResult.status === 'fulfilled' ? 'ok' : 'unavailable';
    const redis = redisResult.status === 'fulfilled' ? 'ok' : 'unavailable';
    if (database === 'unavailable' || redis === 'unavailable') {
      this.logger.error({ message: 'Dependency health check failed', database, redis });
      throw new ServiceUnavailableException({ status: 'unavailable', database, redis });
    }
    return { status: 'ok', database, redis };
  }
}
