import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const supplied = request.headers['x-api-key'];
    const expected = this.config.getOrThrow<string>('INGESTION_API_KEY');
    if (!supplied || supplied !== expected) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
