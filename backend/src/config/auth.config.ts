import { z } from 'zod';

export const AuthConfigSchema = z.object({
  jwtSecret: z.string().min(1),
  adminEmail: z.string().email(),
  /** bcrypt hash of the admin password. */
  adminPasswordHash: z.string().min(1),
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
