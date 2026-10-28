import { Injectable } from '@nestjs/common';
import { TemplateService } from '../admin/template.service';
import { WorkflowService } from '../admin/workflow.service';
import { WorkflowDefinition as AdminWorkflowDefinition } from '../admin/workflow.types';
import { WorkflowDefinition } from '../types/workflow-definition.types';
import { SAMPLE_TEMPLATE, SAMPLE_TEMPLATE_NAME } from './dev-samples';

type NamedRow = { id: string; name: string };

/**
 * Templates and workflows the dev tools create, through the admin services, so the same validation
 * and publishing paths run as for the admin API.
 */
@Injectable()
export class DevFixturesService {
  constructor(
    private readonly templateService: TemplateService,
    private readonly workflowService: WorkflowService,
  ) {}

  /** The account's sample template, created on first use. */
  async ensureTemplate(accountId: string): Promise<string> {
    const templates = (await this.templateService.list(accountId)) as NamedRow[];
    const existing = templates.find((template) => template.name === SAMPLE_TEMPLATE_NAME);
    if (existing) return existing.id;
    const created = (await this.templateService.create(accountId, SAMPLE_TEMPLATE)) as NamedRow;
    return created.id;
  }

  /** The account's active workflow of this name, created and published on first use. */
  async ensureWorkflow(
    accountId: string,
    name: string,
    definition: WorkflowDefinition,
  ): Promise<string> {
    const workflows = (await this.workflowService.list(accountId)) as NamedRow[];
    const existing = workflows.find((workflow) => workflow.name === name);
    if (existing) return existing.id;
    return this.createWorkflow(accountId, name, definition);
  }

  /** Creates and publishes; an invalid definition is a 400 from the admin validation. */
  async createWorkflow(
    accountId: string,
    name: string,
    definition: WorkflowDefinition,
  ): Promise<string> {
    const created = await this.workflowService.create(accountId, {
      name,
      // The admin API's loose definition type; the engine type is the stricter shape of the same JSON.
      definition: definition as AdminWorkflowDefinition,
    });
    await this.workflowService.publish(accountId, created.id);
    return created.id;
  }
}
