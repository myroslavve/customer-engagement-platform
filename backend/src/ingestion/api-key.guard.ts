import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/configuration';

/** Checks x-api-key in constant time (both sides hashed to equal length first). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const supplied = request.headers['x-api-key'];
    const { apiKey } = this.configService.get('ingestion', { infer: true });
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(apiKey))) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
