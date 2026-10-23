import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../infra/database.service';

export type AudienceRule =
  | { all: AudienceRule[] }
  | { any: AudienceRule[] }
  | { not: AudienceRule }
  | { field: string; op: string; value?: unknown };

type AudienceInput = { name: string; rule: AudienceRule };

function valueAt(profile: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, profile);
}

function matches(rule: AudienceRule, profile: Record<string, unknown>): boolean {
  if ('all' in rule) return rule.all.every((child) => matches(child, profile));
  if ('any' in rule) return rule.any.some((child) => matches(child, profile));
  if ('not' in rule) return !matches(rule.not, profile);
  const actual = valueAt(profile, rule.field);
  switch (rule.op) {
    case 'eq': return actual === rule.value;
    case 'neq': return actual !== rule.value;
    case 'exists': return actual !== undefined && actual !== null;
    case 'in': return Array.isArray(rule.value) && rule.value.includes(actual);
    case 'nin': return Array.isArray(rule.value) && !rule.value.includes(actual);
    case 'contains':
      return typeof actual === 'string' && typeof rule.value === 'string'
        ? actual.includes(rule.value)
        : Array.isArray(actual) && actual.includes(rule.value);
    case 'gt': return typeof actual === 'number' && typeof rule.value === 'number' && actual > rule.value;
    case 'gte': return typeof actual === 'number' && typeof rule.value === 'number' && actual >= rule.value;
    case 'lt': return typeof actual === 'number' && typeof rule.value === 'number' && actual < rule.value;
    case 'lte': return typeof actual === 'number' && typeof rule.value === 'number' && actual <= rule.value;
    default: throw new BadRequestException(`Unsupported audience operator: ${rule.op}`);
  }
}

@Injectable()
export class AudienceService {
  constructor(private readonly database: DatabaseService) {}

  async list(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, rule, created_at, updated_at
       FROM audiences WHERE account_id = $1 ORDER BY updated_at DESC`,
      [accountId]
    );
    return result.rows;
  }

  async create(accountId: string, input: AudienceInput) {
    this.validateRule(input.rule);
    const result = await this.database.query(
      `INSERT INTO audiences (account_id, name, rule)
       VALUES ($1, $2, $3)
       RETURNING id, name, rule, created_at, updated_at`,
      [accountId, input.name, JSON.stringify(input.rule)]
    );
    return result.rows[0];
  }

  async preview(accountId: string, rule: AudienceRule): Promise<{ count: number }> {
    this.validateRule(rule);
    const result = await this.database.query<{
      id: string;
      external_id: string;
      email: string | null;
      traits: Record<string, unknown>;
    }>(
      'SELECT id, external_id, email, traits FROM profiles WHERE account_id = $1',
      [accountId]
    );
    const count = result.rows.filter((profile) =>
      matches(rule, {
        id: profile.id,
        externalId: profile.external_id,
        email: profile.email,
        traits: profile.traits
      })
    ).length;
    return { count };
  }

  private validateRule(rule: AudienceRule): void {
    if (!rule || typeof rule !== 'object') throw new BadRequestException('Invalid audience rule');
    if ('all' in rule || 'any' in rule) {
      const children = 'all' in rule ? rule.all : rule.any;
      if (!Array.isArray(children) || children.length === 0) {
        throw new BadRequestException('Audience groups must contain rules');
      }
      children.forEach((child) => this.validateRule(child));
      return;
    }
    if ('not' in rule) {
      this.validateRule(rule.not);
      return;
    }
    if (typeof rule.field !== 'string' || !rule.field || typeof rule.op !== 'string') {
      throw new BadRequestException('Audience leaf rules require field and operator');
    }
  }
}
