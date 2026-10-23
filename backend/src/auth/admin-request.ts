import { UnauthorizedException } from '@nestjs/common';
import { AdminPrincipal } from './admin.types';

export type AdminRequest = { user?: AdminPrincipal };

export function requirePrincipal(request: AdminRequest): AdminPrincipal {
  if (!request.user) throw new UnauthorizedException('Missing admin principal');
  return request.user;
}

export function requireAccountId(request: AdminRequest): string {
  return requirePrincipal(request).accountId;
}
