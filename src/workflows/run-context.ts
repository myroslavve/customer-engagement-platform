import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';

export interface RunContext {
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
}

export function buildRunContext(profile: Profile, event: UserEvent | null): RunContext {
  return {
    profile: {
      id: profile.id,
      externalId: profile.externalId,
      email: profile.email,
      traits: profile.traits,
    },
    event: event
      ? {
          id: event.id,
          name: event.name,
          properties: event.properties,
          occurredAt: event.occurredAt.toISOString(),
        }
      : null,
  };
}
