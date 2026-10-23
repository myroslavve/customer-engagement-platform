import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';
import { isUniqueViolation } from '../database/is-unique-violation';
import {
  collectRuleFields,
  RuleValidationOptions,
  validateRule,
} from '../workflows/condition-validation';

export type AudienceRule =
  | { all: AudienceRule[] }
  | { any: AudienceRule[] }
  | { not: AudienceRule }
  | { field: string; op: string; value?: unknown };

type AudienceInput = { name: string; rule: AudienceRule };

/** Profiles per scan batch, matching the bounded scan documented in the backend README. */
const PROFILE_BATCH = 1_000;
/** How many of a profile's most recent events an event-aware rule may consider. */
const EVENTS_PER_PROFILE = 25;

const AUDIENCE_RULE_OPTIONS: RuleValidationOptions = {
  ruleLabel: 'Audience',
  fieldLabel: 'audience rule field',
  // `traits.*` is shorthand for `profile.traits.*`; `event.*` is the profile's product activity.
  roots: new Set(['profile', 'traits', 'event']),
};

type ProfileRow = {
  id: string;
  external_id: string;
  email: string | null;
  traits: Record<string, unknown>;
};

type EventRow = {
  profile_id: string;
  id: string;
  name: string;
  properties: Record<string, unknown>;
  occurred_at: Date | string;
};

/** What a rule is evaluated against: the profile always, and one event when the rule needs one. */
type RuleContext = {
  profile: Record<string, unknown>;
  event: Record<string, unknown> | null;
};

function valueAt(target: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, target);
}

function resolveField(field: string, ctx: RuleContext): unknown {
  const segments = field.split('.');
  if (segments.length === 1) return ctx.profile[field];
  const [root, ...rest] = segments;
  if (root === 'event') return ctx.event ? valueAt(ctx.event, rest.join('.')) : undefined;
  return valueAt(ctx.profile, (root === 'profile' ? rest : segments).join('.'));
}

function matches(rule: AudienceRule, ctx: RuleContext): boolean {
  if ('all' in rule) return rule.all.every((child) => matches(child, ctx));
  if ('any' in rule) return rule.any.some((child) => matches(child, ctx));
  if ('not' in rule) return !matches(rule.not, ctx);
  const actual = resolveField(rule.field, ctx);
  switch (rule.op) {
    case 'eq':
      return actual === rule.value;
    case 'neq':
      return actual !== rule.value;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(actual);
    case 'nin':
      return Array.isArray(rule.value) && !rule.value.includes(actual);
    case 'contains':
      return typeof actual === 'string' && typeof rule.value === 'string'
        ? actual.includes(rule.value)
        : Array.isArray(actual) && actual.includes(rule.value);
    case 'gt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value;
    case 'gte':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual >= rule.value;
    case 'lt':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual < rule.value;
    case 'lte':
      return typeof actual === 'number' && typeof rule.value === 'number' && actual <= rule.value;
    default:
      throw new BadRequestException(`Unsupported audience operator: ${rule.op}`);
  }
}

@Injectable()
export class AudienceService {
  constructor(private readonly database: AdminDatabaseService) {}

  async list(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, rule, created_at, updated_at
       FROM audiences WHERE account_id = $1 ORDER BY updated_at DESC`,
      [accountId],
    );
    return result.rows;
  }

  async create(accountId: string, input: AudienceInput) {
    this.assertValidRule(input.rule);
    try {
      const result = await this.database.query(
        `INSERT INTO audiences (account_id, name, rule)
         VALUES ($1, $2, $3)
         RETURNING id, name, rule, created_at, updated_at`,
        [accountId, input.name, JSON.stringify(input.rule)],
      );
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An audience with this name already exists');
      }
      throw error;
    }
  }

  /**
   * Counts the profiles a rule selects. A profile matches when the rule holds for it with no event
   * context, or for at least one of its recent events; the second pass only runs for rules that
   * reference `event.*`, so profile-only rules keep the single-query scan.
   */
  async preview(accountId: string, rule: AudienceRule): Promise<{ count: number }> {
    this.assertValidRule(rule);
    const eventAware = [...collectRuleFields(rule)].some(
      (field) => field.split('.')[0] === 'event',
    );
    let lastId: string | undefined;
    let count = 0;
    for (;;) {
      const values: unknown[] = [accountId, PROFILE_BATCH];
      const cursor = lastId ? ' AND id > $3' : '';
      if (lastId) values.push(lastId);
      const result = await this.database.query<ProfileRow>(
        `SELECT id, external_id, email, traits
         FROM profiles
         WHERE account_id = $1${cursor}
         ORDER BY id ASC LIMIT $2`,
        values,
      );
      if (result.rows.length === 0) break;
      count += await this.countMatches(accountId, result.rows, rule, eventAware);
      lastId = result.rows[result.rows.length - 1].id;
      if (result.rows.length < PROFILE_BATCH) break;
    }
    return { count };
  }

  private assertValidRule(rule: AudienceRule): void {
    validateRule(rule, AUDIENCE_RULE_OPTIONS);
  }

  private async countMatches(
    accountId: string,
    rows: ProfileRow[],
    rule: AudienceRule,
    eventAware: boolean,
  ): Promise<number> {
    const contexts = rows.map((row) => ({
      profileId: row.id,
      ctx: {
        profile: {
          id: row.id,
          externalId: row.external_id,
          email: row.email,
          traits: row.traits,
        },
        event: null,
      } satisfies RuleContext,
    }));
    const matched = new Set<string>();
    for (const { profileId, ctx } of contexts) {
      if (matches(rule, ctx)) matched.add(profileId);
    }
    if (!eventAware) return matched.size;

    const pending = contexts.filter((c) => !matched.has(c.profileId)).map((c) => c.profileId);
    if (pending.length === 0) return matched.size;
    const eventsByProfile = await this.loadRecentEvents(accountId, pending);
    for (const { profileId, ctx } of contexts) {
      if (matched.has(profileId)) continue;
      const events = eventsByProfile.get(profileId) ?? [];
      if (events.some((event) => matches(rule, { ...ctx, event }))) matched.add(profileId);
    }
    return matched.size;
  }

  /** The most recent EVENTS_PER_PROFILE events of each profile, as the run context sees them. */
  private async loadRecentEvents(
    accountId: string,
    profileIds: string[],
  ): Promise<Map<string, Record<string, unknown>[]>> {
    const result = await this.database.query<EventRow>(
      `SELECT profile_id, id, name, properties, occurred_at
       FROM (
         SELECT profile_id, id, name, properties, occurred_at,
                ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY occurred_at DESC) AS rank
         FROM events
         WHERE account_id = $1 AND profile_id = ANY($2::uuid[])
       ) ranked
       WHERE rank <= $3
       ORDER BY profile_id, occurred_at DESC`,
      [accountId, profileIds, EVENTS_PER_PROFILE],
    );
    const byProfile = new Map<string, Record<string, unknown>[]>();
    for (const row of result.rows) {
      const event = {
        id: row.id,
        name: row.name,
        properties: row.properties,
        occurredAt: toIso(row.occurred_at),
      };
      byProfile.set(row.profile_id, [...(byProfile.get(row.profile_id) ?? []), event]);
    }
    return byProfile;
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
