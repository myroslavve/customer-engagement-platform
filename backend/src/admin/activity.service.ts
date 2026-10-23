import { Injectable, Logger } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';

export type ActivityItemType = 'event' | 'run' | 'message';

export type ActivityFilter = {
  /** Restricts the feed to one kind. Without it every kind the filters make sense for is returned. */
  type?: ActivityItemType;
  profileId?: string;
  workflowId?: string;
  /** Run or message status; events have no status, so this filter excludes them. */
  status?: string;
  eventName?: string;
  from?: string;
  to?: string;
  limit?: number;
};

/** One row of the activity feed; the remaining keys describe the underlying record. */
export type ActivityItem = Record<string, unknown> & {
  type: ActivityItemType;
  id: string;
  timestamp: string | null;
};

/** Which rows to read: everything matching the request filter, or one user's timeline. */
type ActivityScope = { kind: 'filter'; filter: ActivityFilter } | { kind: 'user'; userId: string };

type EventRow = {
  id: string;
  name: string;
  properties: Record<string, unknown>;
  message_id: string | null;
  occurred_at: Date | string;
  received_at: Date | string | null;
  profile_id: string;
  external_id: string;
  email: string | null;
};

type RunRow = {
  id: string;
  workflow_id: string;
  workflow_name: string | null;
  workflow_version_id: string;
  profile_id: string;
  external_id: string;
  email: string | null;
  trigger_event_id: string;
  status: string;
  current_node_id: string | null;
  waiting_for_event: string | null;
  wait_until: Date | string | null;
  context: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
  finished_at: Date | string | null;
};

type MessageRow = {
  id: string;
  run_id: string;
  node_id: string;
  profile_id: string;
  external_id: string;
  email: string | null;
  to_email: string | null;
  template_id: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  attempts: number;
  sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const MESSAGE_COLUMNS = `m.id, m.run_id, m.node_id, m.profile_id, p.external_id, p.email,
            m.to_email, m.template_id, m.subject, m.status, m.error, m.attempts, m.sent_at,
            m.created_at, m.updated_at`;

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);
  /** Cached so a transient failure is not mistaken for "no messages table" forever. */
  private messagesTable?: boolean;

  constructor(private readonly database: AdminDatabaseService) {}

  /** Events, workflow runs and messages, newest first, trimmed to the requested limit. */
  async list(accountId: string, filter: ActivityFilter): Promise<ActivityItem[]> {
    const limit = clampLimit(filter.limit);
    const scope: ActivityScope = { kind: 'filter', filter };
    const items: ActivityItem[] = [];
    for (const kind of selectedKinds(filter)) {
      items.push(...(await this.read(accountId, kind, scope, limit)));
    }
    return sortAndTrim(items, limit);
  }

  /** Everything recorded for one user, newest first. */
  async userTimeline(
    accountId: string,
    userId: string,
    requestedLimit = 100,
  ): Promise<ActivityItem[]> {
    const limit = clampLimit(requestedLimit);
    const scope: ActivityScope = { kind: 'user', userId };
    const items: ActivityItem[] = [];
    for (const kind of ['event', 'run', 'message'] as const) {
      items.push(...(await this.read(accountId, kind, scope, limit)));
    }
    return sortAndTrim(items, limit);
  }

  private read(
    accountId: string,
    kind: ActivityItemType,
    scope: ActivityScope,
    limit: number,
  ): Promise<ActivityItem[]> {
    if (kind === 'event') return this.eventActivity(accountId, scope, limit);
    if (kind === 'run') return this.runActivity(accountId, scope, limit);
    return this.messageActivity(accountId, scope, limit);
  }

  private async eventActivity(
    accountId: string,
    scope: ActivityScope,
    limit: number,
  ): Promise<ActivityItem[]> {
    const values: unknown[] = [accountId];
    const conditions = ['e.account_id = $1'];
    if (scope.kind === 'user') {
      values.push(scope.userId);
      conditions.push(`p.external_id = $${values.length}`);
    } else {
      addFilter(conditions, values, 'e.profile_id =', scope.filter.profileId);
      addFilter(conditions, values, 'e.name =', scope.filter.eventName);
      addFilter(conditions, values, 'e.occurred_at >=', scope.filter.from);
      addFilter(conditions, values, 'e.occurred_at <=', scope.filter.to);
    }
    values.push(limit);
    const result = await this.database.query<EventRow>(
      `SELECT e.id, e.name, e.properties, e.message_id, e.occurred_at, e.received_at,
              p.id AS profile_id, p.external_id, p.email
       FROM events e JOIN profiles p ON p.id = e.profile_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.occurred_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({
      type: 'event',
      id: row.id,
      timestamp: toIso(row.occurred_at),
      name: row.name,
      properties: row.properties,
      messageId: row.message_id,
      profileId: row.profile_id,
      externalId: row.external_id,
      email: row.email,
      receivedAt: toIso(row.received_at),
    }));
  }

  private async runActivity(
    accountId: string,
    scope: ActivityScope,
    limit: number,
  ): Promise<ActivityItem[]> {
    const values: unknown[] = [accountId];
    const conditions = ['r.account_id = $1'];
    if (scope.kind === 'user') {
      values.push(scope.userId);
      conditions.push(`p.external_id = $${values.length}`);
    } else {
      addFilter(conditions, values, 'r.profile_id =', scope.filter.profileId);
      addFilter(conditions, values, 'r.workflow_id =', scope.filter.workflowId);
      addFilter(conditions, values, 'r.status =', scope.filter.status);
      addFilter(conditions, values, 'r.created_at >=', scope.filter.from);
      addFilter(conditions, values, 'r.created_at <=', scope.filter.to);
    }
    values.push(limit);
    const result = await this.database.query<RunRow>(
      `SELECT r.id, r.workflow_id, w.name AS workflow_name, r.workflow_version_id,
              r.profile_id, p.external_id, p.email, r.trigger_event_id, r.status,
              r.current_node_id, r.waiting_for_event, r.wait_until, r.context,
              r.created_at, r.updated_at, r.finished_at
       FROM workflow_runs r
       JOIN workflows w ON w.id = r.workflow_id
       JOIN profiles p ON p.id = r.profile_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({
      type: 'run',
      id: row.id,
      timestamp: toIso(row.created_at),
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      workflowVersionId: row.workflow_version_id,
      profileId: row.profile_id,
      externalId: row.external_id,
      email: row.email,
      triggerEventId: row.trigger_event_id,
      status: row.status,
      currentNodeId: row.current_node_id,
      waitingForEvent: row.waiting_for_event,
      waitUntil: toIso(row.wait_until),
      // markFailed merges its error into context, so the failure reason travels with the run.
      error: row.context?.error ?? null,
      finishedAt: toIso(row.finished_at),
      updatedAt: toIso(row.updated_at),
    }));
  }

  /**
   * Message outcomes. The messages table arrives with the messaging migration, which is not merged
   * yet; until then message activity is empty rather than an error, and picks up automatically once
   * the migration runs.
   */
  private async messageActivity(
    accountId: string,
    scope: ActivityScope,
    limit: number,
  ): Promise<ActivityItem[]> {
    if (!(await this.hasMessagesTable())) {
      this.logger.debug({ message: 'Message activity skipped: no messages table yet' });
      return [];
    }
    const values: unknown[] = [accountId];
    const conditions = ['m.account_id = $1'];
    if (scope.kind === 'user') {
      values.push(scope.userId);
      conditions.push(`p.external_id = $${values.length}`);
    } else {
      addFilter(conditions, values, 'm.profile_id =', scope.filter.profileId);
      addFilter(conditions, values, 'm.status =', scope.filter.status);
      addFilter(conditions, values, 'm.created_at >=', scope.filter.from);
      addFilter(conditions, values, 'm.created_at <=', scope.filter.to);
    }
    values.push(limit);
    const result = await this.database.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS}
       FROM messages m JOIN profiles p ON p.id = m.profile_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map((row) => ({
      type: 'message',
      id: row.id,
      timestamp: toIso(row.sent_at ?? row.updated_at),
      runId: row.run_id,
      nodeId: row.node_id,
      profileId: row.profile_id,
      externalId: row.external_id,
      email: row.to_email ?? row.email,
      templateId: row.template_id,
      subject: row.subject,
      status: row.status,
      error: row.error,
      attempts: row.attempts,
      sentAt: toIso(row.sent_at),
      createdAt: toIso(row.created_at),
    }));
  }

  private async hasMessagesTable(): Promise<boolean> {
    if (this.messagesTable !== undefined) return this.messagesTable;
    try {
      const result = await this.database.query<{ present: boolean }>(
        `SELECT to_regclass('public.messages') IS NOT NULL AS present`,
      );
      this.messagesTable = result.rows[0]?.present === true;
    } catch {
      return false;
    }
    return this.messagesTable;
  }
}

/**
 * Events carry neither a workflow nor a status, so a filter for one of those is really a question
 * about runs and messages; returning every event alongside them would bury the answer.
 */
function selectedKinds(filter: ActivityFilter): ActivityItemType[] {
  if (filter.type) return [filter.type];
  const kinds: ActivityItemType[] = ['run', 'message'];
  if (!filter.status && !filter.workflowId) kinds.unshift('event');
  return kinds;
}

function sortAndTrim(items: ActivityItem[], limit: number): ActivityItem[] {
  return items
    .sort((a, b) => String(b.timestamp ?? '').localeCompare(String(a.timestamp ?? '')))
    .slice(0, limit);
}

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 100, 1), 500);
}

function addFilter(
  conditions: string[],
  values: unknown[],
  expression: string,
  value: unknown,
): void {
  if (value === undefined || value === '') return;
  values.push(value);
  conditions.push(`${expression} $${values.length}`);
}

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
