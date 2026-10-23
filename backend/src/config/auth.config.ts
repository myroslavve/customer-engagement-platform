import { z } from 'zod';

export const AuthConfigSchema = z.object({
  jwtSecret: z.string().min(1),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export function authConfig(): AuthConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return AuthConfigSchema.parse({
    jwtSecret: process.env.JWT_SECRET || undefined,
  });
}
