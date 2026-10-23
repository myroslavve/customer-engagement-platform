export type CreateEventInput = {
  accountId: string;
  profileId: string;
  name: string;
  properties: Record<string, unknown>;
  messageId: string;
  occurredAt: Date;
};
