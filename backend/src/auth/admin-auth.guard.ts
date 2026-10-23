import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminDatabaseService } from '../admin/admin-database.service';
import { AdminPrincipal } from './admin.types';

type TokenPayload = Omit<AdminPrincipal, 'tokenVersion'> & { tokenVersion?: number };

/** Requires a bearer JWT (signed with the auth config secret by AuthModule) with role admin. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly database: AdminDatabaseService,
  ) {}

  /** Validates the JWT against the current admin record and token version. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: AdminPrincipal;
    }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
    if (
      payload === null ||
      typeof payload !== 'object' ||
      payload.role !== 'admin' ||
      !payload.userId ||
      !payload.accountId
    ) {
      throw new UnauthorizedException('Admin role required');
    }

    const result = await this.database.query<{ token_version: number; role: string }>(
      `SELECT token_version, role FROM admin_users WHERE id = $1 AND account_id = $2`,
      [payload.userId, payload.accountId],
    );
    const user = result.rows[0];
    if (!user || user.role !== 'admin' || user.token_version !== (payload.tokenVersion ?? 0)) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    request.user = {
      userId: payload.userId,
      accountId: payload.accountId,
      email: payload.email,
      role: payload.role,
      tokenVersion: user.token_version,
    };
    return true;
  }
}
