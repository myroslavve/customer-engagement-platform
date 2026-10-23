import { z } from 'zod';

export const AuthConfigSchema = z.object({
  jwtSecret: z.string().min(1),
  adminEmail: z.string().email(),
  /**
   * bcrypt hash of the admin password. Format-checked so a hash mangled by `$` expansion fails at
   * startup instead of making every login return 401 (bcrypt compare returns false, never throws).
   */
  adminPasswordHash: z
    .string()
    // cost 04–31: the range bcryptjs accepts
    .regex(
      /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/,
      'must be a bcrypt hash (quote it in .env)',
    ),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export function authConfig(): AuthConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return AuthConfigSchema.parse({
    jwtSecret: process.env.JWT_SECRET || undefined,
    adminEmail: process.env.ADMIN_EMAIL || undefined,
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || undefined,
  });
}
