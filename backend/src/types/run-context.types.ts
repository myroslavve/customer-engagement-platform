/** What workflow Conditions are evaluated against; Condition.field is a dot path into it. */
export type RunContext = {
  profile: {
    id: string;
    externalId: string;
    email: string | null;
    traits: Record<string, unknown>;
  };
  event: {
    id: string;
    name: string;
    properties: Record<string, unknown>;
    occurredAt: string;
  } | null;
};
