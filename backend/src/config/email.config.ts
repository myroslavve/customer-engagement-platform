import { z } from 'zod';
import { EmailProviderKind } from '../enums/email-provider-kind.enum';

export const EmailConfigSchema = z
  .object({
    provider: z.nativeEnum(EmailProviderKind).default(EmailProviderKind.Log),
    resendApiKey: z.string().min(1).optional(),
    /** "hello@acme.com" or "Acme <hello@acme.com>"; Resend's sandbox sender needs no verified domain. */
    fromAddress: z.string().min(1).default('onboarding@resend.dev'),
    concurrency: z.coerce.number().int().positive().default(2),
  })
  .superRefine((config, ctx) => {
    if (config.provider === EmailProviderKind.Resend && !config.resendApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resendApiKey'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
  });

export type EmailConfig = z.infer<typeof EmailConfigSchema>;

export function emailConfig(): EmailConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return EmailConfigSchema.parse({
    provider: process.env.EMAIL_PROVIDER || undefined,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    fromAddress: process.env.EMAIL_FROM || undefined,
    concurrency: process.env.EMAIL_QUEUE_CONCURRENCY || undefined,
  });
}
