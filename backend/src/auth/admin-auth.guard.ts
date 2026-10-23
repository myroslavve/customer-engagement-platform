import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminPrincipal } from './admin.types';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: AdminPrincipal;
    }>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload = this.jwt.verify<AdminPrincipal>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET')
      });
      if (payload.role !== 'admin') throw new UnauthorizedException('Admin role required');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }
}
