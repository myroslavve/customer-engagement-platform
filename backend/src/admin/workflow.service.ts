import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';
import { NodeType } from '../enums/node-type.enum';
import { WorkflowDefinition, WorkflowInput, WorkflowNode, WorkflowStatus } from './workflow.types';

@Injectable()
export class WorkflowService {
  constructor(private readonly database: AdminDatabaseService) {}

  async list(accountId: string) {
    const result = await this.database.query(
      `SELECT w.id, w.name, w.status, w.published_version_id, w.created_at, w.updated_at,
              v.version, v.definition
       FROM workflows w
       LEFT JOIN LATERAL (
         SELECT version, definition
         FROM workflow_versions
         WHERE workflow_id = w.id
         ORDER BY CASE WHEN id = w.published_version_id THEN 0 ELSE 1 END, version DESC
         LIMIT 1
       ) v ON true
       WHERE w.account_id = $1 ORDER BY w.updated_at DESC`,
      [accountId],
    );
    return result.rows;
  }

  private validateNode(node: WorkflowNode): void {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id) {
      throw new BadRequestException('Workflow nodes require a non-empty id');
    }
    if (!Object.values(NodeType).includes(node.type as NodeType)) {
      throw new BadRequestException(`Unsupported workflow node type: ${String(node.type)}`);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(node.id)) {
      throw new BadRequestException('Workflow node IDs must contain only letters, numbers, _ or -');
    }
    const hasLink = (value: unknown): value is string | null =>
      value === null || typeof value === 'string';
    if (
      node.type === NodeType.Branch &&
      (!node.condition ||
        typeof node.condition !== 'object' ||
        !hasLink(node.next) ||
        !hasLink(node.elseNext))
    ) {
      throw new BadRequestException('Branch nodes require condition, next, and elseNext');
    }
    if (
      node.type === NodeType.Delay &&
      (typeof node.durationMs !== 'number' ||
        !Number.isFinite(node.durationMs) ||
        node.durationMs < 0 ||
        !hasLink(node.next))
    ) {
      throw new BadRequestException('Delay nodes require a non-negative durationMs');
    }
    if (
      node.type === NodeType.WaitForEvent &&
      (typeof node.eventName !== 'string' ||
        !node.eventName ||
        typeof node.timeoutMs !== 'number' ||
        !Number.isFinite(node.timeoutMs) ||
        node.timeoutMs < 0 ||
        !hasLink(node.next) ||
        !hasLink(node.timeoutNext))
    ) {
      throw new BadRequestException('Wait nodes require eventName and a non-negative timeoutMs');
    }
    if (
      node.type === NodeType.SendEmail &&
      (typeof node.templateId !== 'string' || !node.templateId || !hasLink(node.next))
    ) {
      throw new BadRequestException('Send email nodes require templateId');
    }
  }

  async create(accountId: string, input: WorkflowInput) {
    this.validate(input.definition);
    return this.database.transaction(async (client) => {
      const workflow = (await client.query(
        `INSERT INTO workflows (account_id, name)
         VALUES ($1, $2) RETURNING id`,
        [accountId, input.name],
      )) as Array<{ id: string }>;
      const version = (await client.query(
        `INSERT INTO workflow_versions
           (workflow_id, version, trigger_event_name, definition)
         VALUES ($1, 1, $2, $3)
         RETURNING id, version, trigger_event_name, definition, created_at`,
        [workflow[0].id, input.definition.trigger.eventName, JSON.stringify(input.definition)],
      )) as Array<Record<string, unknown>>;
      return {
        id: workflow[0].id,
        name: input.name,
        status: WorkflowStatus.Draft,
        version: version[0],
      };
    });
  }

  async publish(accountId: string, id: string) {
    return this.setStatus(accountId, id, WorkflowStatus.Active, true);
  }

  async pause(accountId: string, id: string) {
    return this.setStatus(accountId, id, WorkflowStatus.Paused, false, WorkflowStatus.Active);
  }

  async resume(accountId: string, id: string) {
    return this.setStatus(accountId, id, WorkflowStatus.Active, false, WorkflowStatus.Paused);
  }

  validate(definition: WorkflowDefinition): true {
    if (
      !definition?.trigger?.eventName ||
      !definition.entryNodeId ||
      !Array.isArray(definition.nodes)
    ) {
      throw new BadRequestException('Workflow requires trigger, entryNodeId, and nodes');
    }
    const nodes = new Map<string, WorkflowNode>();
    for (const node of definition.nodes) {
      this.validateNode(node);
      if (nodes.has(node.id)) throw new BadRequestException('Workflow node IDs must be unique');
      nodes.set(node.id, node);
    }
    if (!nodes.has(definition.entryNodeId)) {
      throw new BadRequestException('Workflow entryNodeId does not resolve');
    }
    for (const node of definition.nodes) {
      for (const target of this.targets(node)) {
        if (target !== null && target !== undefined && !nodes.has(target)) {
          throw new BadRequestException(`Workflow node target does not resolve: ${target}`);
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new BadRequestException('Workflow definition must be acyclic');
      if (visited.has(id)) return;
      visiting.add(id);
      for (const target of this.targets(nodes.get(id)!)) {
        if (target) visit(target);
      }
      visiting.delete(id);
      visited.add(id);
    };
    visit(definition.entryNodeId);
    return true;
  }

  private targets(node: WorkflowNode): Array<string | null | undefined> {
    return [node.next, node.elseNext, node.timeoutNext];
  }

  private async setStatus(
    accountId: string,
    id: string,
    status: WorkflowStatus,
    publishVersion: boolean,
    expectedStatus?: WorkflowStatus,
  ) {
    const result = await this.database.query(
      `UPDATE workflows w
       SET status = $3,
           published_version_id = CASE WHEN $4 THEN
             (SELECT id FROM workflow_versions WHERE workflow_id = w.id ORDER BY version DESC LIMIT 1)
             ELSE w.published_version_id END,
           updated_at = NOW()
       WHERE w.id = $1 AND w.account_id = $2
         AND ($5::workflow_status IS NULL OR w.status = $5::workflow_status)
         AND ($3 <> 'active' OR $4 OR w.published_version_id IS NOT NULL)
       RETURNING id, name, status, published_version_id, updated_at`,
      [id, accountId, status, publishVersion, expectedStatus ?? null],
    );
    if (!result.rows[0]) throw new NotFoundException('Workflow not found');
    return result.rows[0];
  }
}
