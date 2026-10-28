/** Who triggers a dev run and with what; everything is optional. */
export type DevTriggerInput = {
  /** External id; a fresh `dev-<id>` by default, so every call gets its own profile. */
  userId?: string;
  /** `<userId>@example.com` by default; null makes a profile without an address. */
  email?: string | null;
  traits?: Record<string, unknown>;
  /** Properties of the trigger event. */
  properties?: Record<string, unknown>;
  /** Marks the profile unsubscribed before the trigger (messaging then skips it). */
  unsubscribed?: boolean;
};

export type DevTriggerResult = {
  workflowId: string;
  userId: string;
  /** The trigger event name sent through ingestion. */
  eventName: string;
  eventId: string;
  /** null when no run started within the wait (e.g. the trigger filter rejected the event). */
  runId: string | null;
};

export type DevEventInput = {
  eventName: string;
  properties?: Record<string, unknown>;
};
