import { z } from 'zod';

export const IngestionConfigSchema = z.object({
  /** Shared secret the customer product sends as x-api-key. */
  apiKey: z.string().min(1),
  /** Account every ingested profile/event belongs to (single API key, single account for now). */
  accountId: z.string().uuid(),
});

export type IngestionConfig = z.infer<typeof IngestionConfigSchema>;

export function ingestionConfig(): IngestionConfig {
  // `|| undefined`: an empty VAR= in .env means "not set"
  return IngestionConfigSchema.parse({
    apiKey: process.env.INGESTION_API_KEY || undefined,
    accountId: process.env.INGESTION_ACCOUNT_ID || undefined,
  });
}
