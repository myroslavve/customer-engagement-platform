import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';
import { isUniqueViolation } from '../database/is-unique-violation';

export type AudienceRule =
  | { all: AudienceRule[] }
  | { any: AudienceRule[] }
  | { not: AudienceRule }
  | { field: string; op: string; value?: unknown };

type AudienceInput = { name: string; rule: AudienceRule };
const SUPPORTED_OPERATORS = new Set([
  'eq',
  'neq',
  'exists',
  'in',
  'nin',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
]);

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
    this.validateRule(input.rule);
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

  async preview(accountId: string, rule: AudienceRule): Promise<{ count: number }> {
    this.validateRule(rule);
    const batchSize = 1_000;
    let lastId: string | undefined;
    let count = 0;
    for (;;) {
      const values: unknown[] = [accountId, batchSize];
      const cursor = lastId ? ' AND id > $3' : '';
      if (lastId) values.push(lastId);
      const result = await this.database.query<{
        id: string;
        external_id: string;
        email: string | null;
        traits: Record<string, unknown>;
      }>(
        `SELECT id, external_id, email, traits
         FROM profiles
         WHERE account_id = $1${cursor}
         ORDER BY id ASC LIMIT $2`,
        values,
      );
      if (result.rows.length === 0) break;
      count += result.rows.filter((profile) =>
        matches(rule, {
          id: profile.id,
          externalId: profile.external_id,
          email: profile.email,
          traits: profile.traits,
        }),
      ).length;
      lastId = result.rows[result.rows.length - 1].id;
      if (result.rows.length < batchSize) break;
    }
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
    if (!SUPPORTED_OPERATORS.has(rule.op)) {
      throw new BadRequestException(`Unsupported audience operator: ${rule.op}`);
    }
  }
}
