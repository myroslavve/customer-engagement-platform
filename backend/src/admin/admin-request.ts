import { UnauthorizedException } from '@nestjs/common';
import { AdminPrincipal } from '../auth/admin.types';

export type AdminRequest = {
  user?: AdminPrincipal;
};

export function requireAccountId(request: AdminRequest): string {
  if (!request.user?.accountId) throw new UnauthorizedException('Missing account context');
  return request.user.accountId;
}
