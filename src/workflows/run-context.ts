import { Profile } from '../database/entities/profile.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { RunContext } from '../types/run-context.types';

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
