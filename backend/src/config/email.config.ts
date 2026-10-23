import { z } from 'zod';

export const EmailConfigSchema = z.object({
  resendApiKey: z.string().min(1),
  /** "hello@acme.com" or "Acme <hello@acme.com>"; Resend's sandbox sender needs no verified domain. */
  fromAddress: z.string().min(1).default('onboarding@resend.dev'),
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
