import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Requires a bearer JWT (signed with the auth config secret by AuthModule) with role admin. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { role?: string };
    }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload = this.jwtService.verify<{ role?: string }>(token);
      if (payload.role !== 'admin') throw new UnauthorizedException('Admin role required');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
