import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../infra/database.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly database: DatabaseService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      accountId?: string;
    }>();
    const supplied = request.headers['x-api-key'];
    if (!supplied) throw new UnauthorizedException('Invalid API key');
    const keyHash = createHash('sha256').update(supplied).digest('hex');
    const result = await this.database.query<{ account_id: string }>(
      `SELECT account_id FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash]
    );
    if (!result.rows[0]) {
      throw new UnauthorizedException('Invalid API key');
    }
    request.accountId = result.rows[0].account_id;
    return true;
  }
}
