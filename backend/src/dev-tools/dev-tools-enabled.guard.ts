import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/** /dev/* answers 404, as if the routes did not exist, unless DEV_TOOLS_ENABLED=true. */
@Injectable()
export class DevToolsEnabledGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(): boolean {
    if (this.configService.get('server', { infer: true }).devToolsEnabled) return true;
    throw new NotFoundException();
  }
}
