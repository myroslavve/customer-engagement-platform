import { Injectable } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';

type ActivityFilter = {
  profileId?: string;
  eventName?: string;
  from?: string;
  to?: string;
  limit?: number;
};

@Injectable()
export class ActivityService {
  constructor(private readonly database: AdminDatabaseService) {}

  async list(accountId: string, filter: ActivityFilter) {
    const values: unknown[] = [accountId];
    const conditions = ['e.account_id = $1'];
    this.addFilter(conditions, values, 'e.profile_id =', filter.profileId);
    this.addFilter(conditions, values, 'e.name =', filter.eventName);
    this.addFilter(conditions, values, 'e.occurred_at >=', filter.from);
    this.addFilter(conditions, values, 'e.occurred_at <=', filter.to);
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    values.push(limit);
    const result = await this.database.query(
      `SELECT e.id, e.name, e.properties, e.message_id, e.occurred_at, e.received_at,
              p.id AS profile_id, p.external_id, p.email
       FROM events e JOIN profiles p ON p.id = e.profile_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.occurred_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows;
  }

  async userTimeline(accountId: string, userId: string) {
    const result = await this.database.query(
      `SELECT e.id, e.name, e.properties, e.message_id, e.occurred_at, e.received_at
       FROM events e
       JOIN profiles p ON p.id = e.profile_id
       WHERE e.account_id = $1 AND p.external_id = $2
       ORDER BY e.occurred_at DESC`,
      [accountId, userId],
    );
    return result.rows;
  }

  private addFilter(
    conditions: string[],
    values: unknown[],
    expression: string,
    value: unknown,
  ): void {
    if (value === undefined || value === '') return;
    values.push(value);
    conditions.push(`${expression} $${values.length}`);
  }
}
