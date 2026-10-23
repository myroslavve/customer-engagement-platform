export type UpsertProfileInput = {
  accountId: string;
  externalId: string;
  /** null keeps the stored email. */
  email: string | null;
  /** Merged into the stored traits (incoming keys win). */
  traits: Record<string, unknown>;
};
