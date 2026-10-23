import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AppConfig } from '../config/configuration';

/** Checks x-api-key in constant time (both sides hashed to equal length first). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly dataSource: DataSource,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      accountId?: string;
    }>();
    const supplied = request.headers['x-api-key'];
    const { apiKey, accountId } = this.configService.get('ingestion', { infer: true });
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!supplied) throw new UnauthorizedException('Invalid API key');
    if (timingSafeEqual(digest(supplied), digest(apiKey))) {
      request.accountId = accountId;
      return true;
    }
    return this.validateDatabaseKey(supplied, request);
  }

  private async validateDatabaseKey(
    supplied: string,
    request: { accountId?: string },
  ): Promise<boolean> {
    const keyHash = createHash('sha256').update(supplied).digest('hex');
    const rows = await this.dataSource.query<Array<{ account_id: string }>>(
      'SELECT account_id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [keyHash],
    );
    if (!rows[0]) {
      throw new UnauthorizedException('Invalid API key');
    }
    request.accountId = rows[0].account_id;
    return true;
  }
}
