import { z } from 'zod';

export const EmailConfigSchema = z.object({
  resendApiKey: z.string().min(1),
  /**
   * "hello@acme.com" or "Acme <hello@acme.com>" on a verified domain. No default: Resend's sandbox
   * sender (onboarding@resend.dev) only reaches the account owner, so it is for local use only.
   */
  fromAddress: z.string().min(1),
  concurrency: z.coerce.number().int().positive().default(2),
});

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

export function emailConfig(): EmailConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return EmailConfigSchema.parse({
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    fromAddress: process.env.EMAIL_FROM || undefined,
    concurrency: process.env.EMAIL_QUEUE_CONCURRENCY || undefined,
  });
}
