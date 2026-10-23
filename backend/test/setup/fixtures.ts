import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Account } from '../../src/database/entities/account.entity';
import { Profile } from '../../src/database/entities/profile.entity';
import { Template } from '../../src/database/entities/template.entity';
import { UserEvent } from '../../src/database/entities/user-event.entity';
import { WorkflowRun } from '../../src/database/entities/workflow-run.entity';
import { WorkflowVersion } from '../../src/database/entities/workflow-version.entity';
import { Workflow } from '../../src/database/entities/workflow.entity';
import { RunStatus } from '../../src/enums/run-status.enum';
import { WorkflowStatus } from '../../src/enums/workflow-status.enum';
import { RunState } from '../../src/types/run-state.types';
import { WorkflowDefinition } from '../../src/types/workflow-definition.types';

/** Rows the tests seed directly; the engine under test only ever sees them through its repositories. */

export type ProfileOverrides = {
  email?: string | null;
  traits?: Record<string, unknown>;
  unsubscribedAt?: Date | null;
};

export type SeededWorkflow = {
  workflow: Workflow;
  version: WorkflowVersion;
};

export type TemplateInput = {
  subject: string;
  body: string;
};

/** A run placed directly at a node, as if earlier steps had already moved it there. */
export type RunOverrides = {
  status: RunStatus;
  currentNodeId: string | null;
  waitingForEvent?: string | null;
  claimKey?: string | null;
  context?: RunState;
};

export function createAccount(dataSource: DataSource): Promise<Account> {
  return dataSource.getRepository(Account).save({ name: `account-${randomUUID()}` });
}

export function createProfile(
  dataSource: DataSource,
  account: Account,
  overrides: ProfileOverrides = {},
): Promise<Profile> {
  return dataSource.getRepository(Profile).save({
    accountId: account.id,
    externalId: `user-${randomUUID()}`,
    email: overrides.email === undefined ? 'person@example.com' : overrides.email,
    traits: overrides.traits ?? {},
    unsubscribedAt: overrides.unsubscribedAt ?? null,
  });
}

export function createEvent(
  dataSource: DataSource,
  account: Account,
  profile: Profile,
  name: string,
  properties: Record<string, unknown> = {},
): Promise<UserEvent> {
  return dataSource.getRepository(UserEvent).save({
    accountId: account.id,
    profileId: profile.id,
    name,
    properties,
    messageId: randomUUID(),
    occurredAt: new Date(),
  });
}

/** A workflow with one version, published. */
export async function createWorkflow(
  dataSource: DataSource,
  account: Account,
  definition: WorkflowDefinition,
  status: WorkflowStatus = WorkflowStatus.Active,
): Promise<SeededWorkflow> {
  const workflows = dataSource.getRepository(Workflow);
  const workflow = await workflows.save({
    accountId: account.id,
    name: `wf-${randomUUID()}`,
    status,
  });
  const version = await dataSource.getRepository(WorkflowVersion).save({
    workflowId: workflow.id,
    version: 1,
    triggerEventName: definition.trigger.eventName,
    definition,
  });
  await workflows.update(workflow.id, { publishedVersionId: version.id });
  return { workflow: { ...workflow, publishedVersionId: version.id }, version };
}

export function createRun(
  dataSource: DataSource,
  seeded: SeededWorkflow,
  profile: Profile,
  triggerEvent: UserEvent,
  overrides: RunOverrides,
): Promise<WorkflowRun> {
  return dataSource.getRepository(WorkflowRun).save({
    accountId: profile.accountId,
    workflowId: seeded.workflow.id,
    workflowVersionId: seeded.version.id,
    profileId: profile.id,
    triggerEventId: triggerEvent.id,
    waitingForEvent: null,
    claimKey: null,
    context: {},
    ...overrides,
  });
}

export function createTemplate(
  dataSource: DataSource,
  account: Account,
  input: TemplateInput,
): Promise<Template> {
  return dataSource.getRepository(Template).save({
    accountId: account.id,
    name: `tpl-${randomUUID()}`,
    ...input,
  });
}
