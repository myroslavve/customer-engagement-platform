import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../src/database/entities/account.entity';
import { Message } from '../src/database/entities/message.entity';
import { Profile } from '../src/database/entities/profile.entity';
import { Template } from '../src/database/entities/template.entity';
import { WorkflowRun } from '../src/database/entities/workflow-run.entity';
import { MessageReason } from '../src/enums/message-reason.enum';
import { MessageStatus } from '../src/enums/message-status.enum';
import { NodeType } from '../src/enums/node-type.enum';
import { RunStatus } from '../src/enums/run-status.enum';
import { RunStepStatus } from '../src/enums/run-step-status.enum';
import { StepCause } from '../src/enums/step-cause.enum';
import { QueueProducer } from '../src/queues/queue-producer';
import { QUEUE_EMAIL_SEND } from '../src/queues/queue-names';
import { RunStep } from '../src/database/entities/run-step.entity';
import { WorkflowDefinition } from '../src/types/workflow-definition.types';
import { buildRunContext } from '../src/workflows/run-context';
import { truncateAll } from './setup/database';
import {
  createAccount,
  createEvent,
  createProfile,
  createRun,
  createTemplate,
  createWorkflow,
  ProfileOverrides,
} from './setup/fixtures';
import { getQueue, obliterateQueues, reprocessJob, waitForJobState } from './setup/queues';
import { createTestApp, TestApp } from './setup/test-app';
import { waitFor } from './setup/wait-for';

const FINAL = new Set([MessageStatus.Sent, MessageStatus.Failed, MessageStatus.Skipped]);
const UNKNOWN_TEMPLATE_ID = '00000000-0000-0000-0000-00000000dead';

type TriggerOptions = ProfileOverrides & {
  /** Overrides the node's templateId (default: the seeded template). */
  templateId?: (account: Account) => Promise<string>;
};

type TriggeredRun = { runId: string; template: Template; profile: Profile };

function emailDefinition(templateId: string): WorkflowDefinition {
  return {
    trigger: { eventName: 'product_viewed' },
    entryNodeId: 'email',
    nodes: [
      { id: 'email', type: NodeType.SendEmail, templateId, next: 'exit' },
      { id: 'exit', type: NodeType.Exit },
    ],
  };
}

describe('messaging', () => {
  let testApp: TestApp;
  let queueProducer: QueueProducer;

  beforeAll(async () => {
    testApp = await createTestApp();
    queueProducer = testApp.get(QueueProducer);
  });
  afterAll(() => testApp.close());
  beforeEach(async () => {
    await obliterateQueues(testApp.app);
    await truncateAll(testApp.dataSource);
    testApp.fakeEmailProvider.reset();
  });

  const messages = () => testApp.dataSource.getRepository(Message);
  const runs = () => testApp.dataSource.getRepository(WorkflowRun);
  const emailQueue = () => getQueue(testApp.app, QUEUE_EMAIL_SEND);

  /** Account, profile, template, `send_email → exit` workflow; triggers the run through the events queue. */
  async function trigger(options: TriggerOptions = {}): Promise<TriggeredRun> {
    const { templateId, ...profileOverrides } = options;
    const account = await createAccount(testApp.dataSource);
    const profile = await createProfile(testApp.dataSource, account, profileOverrides);
    const template = await createTemplate(testApp.dataSource, account, {
      subject: 'Hi {{profile.traits.name}}',
      body: '<p>Hello {{profile.traits.name}}, you viewed {{event.properties.sku}}</p>',
    });
    const nodeTemplateId = templateId ? await templateId(account) : template.id;
    await createWorkflow(testApp.dataSource, account, emailDefinition(nodeTemplateId));
    const event = await createEvent(testApp.dataSource, account, profile, 'product_viewed', {
      sku: 'A<1>',
    });
    await queueProducer.enqueueProcessEvent({ eventId: event.id });
    const run = await waitFor(
      () => runs().findOneBy({ triggerEventId: event.id }),
      (found) => found !== null,
    );
    return { runId: run!.id, template, profile };
  }

  const waitForMessage = (runId: string, predicate: (message: Message) => boolean) =>
    waitFor(
      () => messages().findOneBy({ runId }),
      (message) => message !== null && predicate(message),
    ) as Promise<Message>;
  const waitForFinalMessage = (runId: string) =>
    waitForMessage(runId, (message) => FINAL.has(message.status));
  const waitForRunStatus = (runId: string, status: RunStatus) =>
    waitFor(
      () => runs().findOneByOrFail({ id: runId }),
      (run) => run.status === status,
    );

  describe('sending', () => {
    it('renders and sends the email once, then completes the run', async () => {
      const { runId, profile } = await trigger({ traits: { name: 'Ann & <Bob>' } });
      const message = await waitForFinalMessage(runId);
      expect(message).toMatchObject({
        status: MessageStatus.Sent,
        nodeId: 'email',
        providerMessageId: 'fake-1',
        subject: 'Hi Ann & <Bob>',
        attempts: 1,
        toEmail: 'person@example.com',
        error: null,
      });
      expect(message.sentAt).not.toBeNull();
      expect(message.variables.profile.id).toBe(profile.id);
      expect(testApp.fakeEmailProvider.sent).toEqual([
        {
          to: 'person@example.com',
          subject: 'Hi Ann & <Bob>',
          html: '<p>Hello Ann &amp; &lt;Bob&gt;, you viewed A&lt;1&gt;</p>',
          idempotencyKey: message.id,
        },
      ]);
      expect((await waitForRunStatus(runId, RunStatus.Completed)).status).toBe(RunStatus.Completed);
    });

    it('skips profiles without an email address or unsubscribed', async () => {
      const noEmail = await trigger({ email: null });
      expect(await waitForFinalMessage(noEmail.runId)).toMatchObject({
        status: MessageStatus.Skipped,
        error: MessageReason.NoEmail,
        toEmail: null,
      });

      const unsubscribed = await trigger({ unsubscribedAt: new Date() });
      expect(await waitForFinalMessage(unsubscribed.runId)).toMatchObject({
        status: MessageStatus.Skipped,
        error: MessageReason.Unsubscribed,
      });
      expect(testApp.fakeEmailProvider.calls).toBe(0);
      await waitForRunStatus(unsubscribed.runId, RunStatus.Completed);
    });

    it('fails a queued message whose template was deleted', async () => {
      let runId = '';
      await testApp.pauseQueue(QUEUE_EMAIL_SEND);
      try {
        const started = await trigger();
        runId = started.runId;
        await waitForMessage(runId, (message) => message.status === MessageStatus.Queued);
        await testApp.dataSource.getRepository(Template).delete(started.template.id);
      } finally {
        testApp.resumeQueue(QUEUE_EMAIL_SEND);
      }
      expect(await waitForFinalMessage(runId)).toMatchObject({
        status: MessageStatus.Failed,
        error: MessageReason.TemplateNotFound,
        templateId: null,
      });
      expect(testApp.fakeEmailProvider.calls).toBe(0);
    });

    it('reuses the message a retried send_email step already recorded', async () => {
      const account = await createAccount(testApp.dataSource);
      const profile = await createProfile(testApp.dataSource, account);
      const template = await createTemplate(testApp.dataSource, account, {
        subject: 'Hi',
        body: '<p>Hi</p>',
      });
      const seeded = await createWorkflow(
        testApp.dataSource,
        account,
        emailDefinition(template.id),
      );
      const trigger = await createEvent(testApp.dataSource, account, profile, 'product_viewed');
      const run = await createRun(testApp.dataSource, seeded, profile, trigger, {
        status: RunStatus.Running,
        currentNodeId: 'email',
      });
      // A previous attempt of the step wrote the message, then failed before recording the step.
      const recorded = await messages().save({
        accountId: account.id,
        runId: run.id,
        nodeId: 'email',
        profileId: profile.id,
        templateId: template.id,
        toEmail: profile.email,
        variables: buildRunContext(profile, trigger),
      });

      await queueProducer.enqueueStep({ runId: run.id, nodeId: 'email', cause: StepCause.Enter });
      await waitForRunStatus(run.id, RunStatus.Completed);
      expect(await waitForFinalMessage(run.id)).toMatchObject({
        id: recorded.id,
        status: MessageStatus.Sent,
      });
      expect(await messages().countBy({ runId: run.id })).toBe(1);
      expect(testApp.fakeEmailProvider.calls).toBe(1);
    });
  });

  describe('provider failures', () => {
    it('retries definitive rejections and sends on the third attempt', async () => {
      testApp.fakeEmailProvider.rejectNext(2);
      const { runId } = await trigger();
      expect(await waitForFinalMessage(runId)).toMatchObject({
        status: MessageStatus.Sent,
        attempts: 3,
        providerMessageId: 'fake-3',
      });
      expect(testApp.fakeEmailProvider.calls).toBe(3);
      expect(testApp.fakeEmailProvider.sent).toHaveLength(1);
    });

    it('fails at once on a non-retryable rejection', async () => {
      testApp.fakeEmailProvider.rejectNext(1, false);
      const { runId } = await trigger();
      expect(await waitForFinalMessage(runId)).toMatchObject({
        status: MessageStatus.Failed,
        attempts: 1,
        error: 'fake rejection',
      });
      expect(testApp.fakeEmailProvider.calls).toBe(1);
    });

    it('fails after the retries are exhausted, leaving the run completed', async () => {
      testApp.fakeEmailProvider.rejectNext(5);
      const { runId } = await trigger();
      expect(await waitForFinalMessage(runId)).toMatchObject({
        status: MessageStatus.Failed,
        attempts: 5,
        error: 'fake rejection',
      });
      expect(testApp.fakeEmailProvider.calls).toBe(5);
      expect((await runs().findOneByOrFail({ id: runId })).status).toBe(RunStatus.Completed);
    });

    it('never re-sends after an unknown outcome: postpones while the claim is fresh, then fails', async () => {
      testApp.fakeEmailProvider.crashNext(1);
      const { runId } = await trigger();
      const message = await waitForMessage(
        runId,
        (current) => current.status === MessageStatus.Sending,
      );
      // The retry finds a fresh `sending` claim (it may be another worker's) and waits for it.
      const job = await waitFor(
        () => emailQueue().getJob(message.id),
        (current) => current !== undefined && current.attemptsStarted >= 2,
      );
      expect(await waitForJobState(testApp.app, QUEUE_EMAIL_SEND, message.id, 'delayed')).toBe(
        'delayed',
      );
      expect((await messages().findOneByOrFail({ id: message.id })).status).toBe(
        MessageStatus.Sending,
      );

      // Once the claim is older than the provider timeout it counts as abandoned.
      await testApp.dataSource.query(
        `UPDATE messages SET updated_at = now() - interval '2 minutes' WHERE id = $1`,
        [message.id],
      );
      await job!.promote();
      expect(await waitForFinalMessage(runId)).toMatchObject({
        status: MessageStatus.Failed,
        error: MessageReason.SendInterrupted,
      });
      expect(testApp.fakeEmailProvider.calls).toBe(1);
      expect(testApp.fakeEmailProvider.sent).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('does not send again when the job of a sent message is re-run', async () => {
      const { runId } = await trigger();
      const message = await waitForFinalMessage(runId);
      await reprocessJob(testApp.app, QUEUE_EMAIL_SEND, message.id);
      await waitForJobState(testApp.app, QUEUE_EMAIL_SEND, message.id, 'completed');
      expect(testApp.fakeEmailProvider.calls).toBe(1);
      expect(await messages().findOneByOrFail({ id: message.id })).toMatchObject({
        status: MessageStatus.Sent,
        attempts: 1,
      });
    });

    it('does not send when the job of a skipped message is re-run', async () => {
      const { runId } = await trigger({ email: null });
      const message = await waitForFinalMessage(runId);
      await testApp.dataSource.getRepository(Profile).update(message.profileId, {
        email: 'late@example.com',
      });
      await reprocessJob(testApp.app, QUEUE_EMAIL_SEND, message.id);
      await waitForJobState(testApp.app, QUEUE_EMAIL_SEND, message.id, 'completed');
      expect(testApp.fakeEmailProvider.calls).toBe(0);
      expect((await messages().findOneByOrFail({ id: message.id })).status).toBe(
        MessageStatus.Skipped,
      );
    });
  });

  describe('template references', () => {
    it.each([
      ['an unknown template', async () => UNKNOWN_TEMPLATE_ID],
      ['a template id that is not a uuid', async () => 'welcome-email'],
      [
        "another account's template",
        async () => {
          const other = await createAccount(testApp.dataSource);
          return (await createTemplate(testApp.dataSource, other, { subject: 's', body: 'b' })).id;
        },
      ],
    ])('fails the run at the send_email node for %s', async (_case, templateId) => {
      const { runId } = await trigger({ templateId });
      const failed = await waitForRunStatus(runId, RunStatus.Failed);
      expect(failed.currentNodeId).toBe('email');
      expect(failed.context.error).toContain('not found');
      expect(await testApp.dataSource.getRepository(RunStep).findBy({ runId })).toMatchObject([
        { nodeId: 'email', nodeType: NodeType.SendEmail, status: RunStepStatus.Failed },
      ]);
      expect(await messages().count()).toBe(0);
    });
  });
});
