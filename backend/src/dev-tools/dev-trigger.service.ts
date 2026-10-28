import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IngestionService } from '../ingestion/ingestion.service';
import { DevScenarioInfo } from '../types/dev-scenario.types';
import { DevEventInput, DevTriggerInput, DevTriggerResult } from '../types/dev-trigger.types';
import { IngestionResult } from '../types/ingestion-result.types';
import { WorkflowDefinition } from '../types/workflow-definition.types';
import { ProfileRepository } from '../workflows/profile.repository';
import { RunRepository } from '../workflows/run.repository';
import { DevFixturesService } from './dev-fixtures.service';
import { DEV_SCENARIOS, scenarioEventName } from './dev-scenarios';
import { RunInspectorService } from './run-inspector.service';

/** How long a trigger call waits for the events worker to start the run. */
const RUN_START_TIMEOUT_MS = 5_000;
const RUN_START_POLL_MS = 100;
const DEFAULT_PROPERTIES = { product_title: 'Test product' };

/**
 * Starts workflow runs the way the customer product would: identify + track through the
 * ingestion service (idempotency, outbox, events queue), then hands back the run the worker started.
 */
@Injectable()
export class DevTriggerService {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly devFixturesService: DevFixturesService,
    private readonly profileRepository: ProfileRepository,
    private readonly runRepository: RunRepository,
    private readonly runInspectorService: RunInspectorService,
  ) {}

  listScenarios(): DevScenarioInfo[] {
    return DEV_SCENARIOS.map(({ name, description, hint }) => ({ name, description, hint }));
  }

  /** The scenario's workflow is created once per account and reused; each call starts a new run. */
  async runScenario(
    accountId: string,
    name: string,
    input: DevTriggerInput,
  ): Promise<DevTriggerResult> {
    const scenario = DEV_SCENARIOS.find((candidate) => candidate.name === name);
    if (!scenario) throw new NotFoundException(`Unknown scenario "${name}"`);
    const eventName = scenarioEventName(name);
    const templateId = await this.devFixturesService.ensureTemplate(accountId);
    const workflowId = await this.devFixturesService.ensureWorkflow(accountId, `dev-${name}`, {
      ...scenario.definition(templateId),
      trigger: { eventName },
    });
    return this.trigger(accountId, workflowId, eventName, input);
  }

  /**
   * A new workflow per call. Its trigger event name is replaced by a unique one, so only this
   * workflow reacts; the trigger filter is kept and sees input.properties.
   */
  async runDefinition(
    accountId: string,
    definition: WorkflowDefinition,
    input: DevTriggerInput,
  ): Promise<DevTriggerResult> {
    const id = randomUUID();
    const eventName = `dev.adhoc.${id}`;
    const workflowId = await this.devFixturesService.createWorkflow(accountId, `dev-adhoc-${id}`, {
      ...definition,
      trigger: { ...definition.trigger, eventName },
    });
    return this.trigger(accountId, workflowId, eventName, input);
  }

  /** Tracks an event as the run's profile, e.g. the one a wait_for_event node waits for. */
  async sendEvent(
    accountId: string,
    runId: string,
    input: DevEventInput,
  ): Promise<IngestionResult> {
    const run = await this.runInspectorService.findRunOrFail(accountId, runId);
    const profile = await this.profileRepository.findByIdOrFail(run.profileId);
    return this.ingestionService.track(
      {
        userId: profile.externalId,
        eventName: input.eventName,
        properties: input.properties ?? {},
        messageId: randomUUID(),
      },
      accountId,
    );
  }

  private async trigger(
    accountId: string,
    workflowId: string,
    eventName: string,
    input: DevTriggerInput,
  ): Promise<DevTriggerResult> {
    const userId = input.userId ?? `dev-${randomUUID().slice(0, 8)}`;
    await this.identify(accountId, userId, input);
    const { eventId } = await this.ingestionService.track(
      {
        userId,
        eventName,
        properties: input.properties ?? DEFAULT_PROPERTIES,
        messageId: randomUUID(),
      },
      accountId,
    );
    // eventId is absent only when a concurrent request stored the same messageId; ours is fresh.
    const runId = await this.waitForRunStart(workflowId, eventId!);
    return { workflowId, userId, eventName, eventId: eventId!, runId };
  }

  /** Profile first, so the run sees its email and traits; unsubscribing needs the stored profile. */
  private async identify(accountId: string, userId: string, input: DevTriggerInput): Promise<void> {
    const email = input.email === undefined ? `${userId}@example.com` : input.email;
    await this.ingestionService.identify(
      { userId, email: email ?? undefined, traits: input.traits, messageId: randomUUID() },
      accountId,
    );
    if (!input.unsubscribed) return;
    const profile = await this.profileRepository.findByExternalId(accountId, userId);
    await this.profileRepository.markUnsubscribed(profile!.id);
  }

  private async waitForRunStart(workflowId: string, eventId: string): Promise<string | null> {
    const deadline = Date.now() + RUN_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const run = await this.runRepository.findByTriggerEvent(workflowId, eventId);
      if (run) return run.id;
      await new Promise((resolve) => setTimeout(resolve, RUN_START_POLL_MS));
    }
    return null;
  }
}
