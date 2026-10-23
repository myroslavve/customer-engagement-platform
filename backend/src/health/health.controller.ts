import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../infra/database.service';
import { RedisService } from '../infra/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService
  ) {}

  @Get()
  async getHealth(): Promise<{ status: string; database: string; redis: string }> {
    try {
      await Promise.all([
        this.database.healthcheck(),
        this.redis.healthcheck(2_000)
      ]);
      return { status: 'ok', database: 'ok', redis: 'ok' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        database: 'unknown',
        redis: 'unknown'
      });
    }
  }
}
