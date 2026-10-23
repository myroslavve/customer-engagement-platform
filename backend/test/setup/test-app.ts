import { WorkerHost } from '@nestjs/bullmq';
import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EventsProcessor } from '../../src/event-processing/events.processor';
import { EMAIL_PROVIDER } from '../../src/messaging/email-provider';
import { EmailSendProcessor } from '../../src/messaging/email-send.processor';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../../src/queues/queue-names';
import { StepsProcessor } from '../../src/workflow-execution/steps.processor';
import { FakeEmailProvider } from './fake-email-provider';

export type TestApp = {
  app: INestApplication;
  dataSource: DataSource;
  fakeEmailProvider: FakeEmailProvider;
  get<T>(token: Type<T>): T;
  /** Stops the queue's worker from taking jobs (they stay waiting/delayed); resumeQueue undoes it. */
  pauseQueue(queueName: string): Promise<void>;
  resumeQueue(queueName: string): void;
  close(): Promise<void>;
};

const PROCESSORS: Record<string, Type<WorkerHost>> = {
  [QUEUE_EVENTS]: EventsProcessor,
  [QUEUE_WORKFLOW_STEPS]: StepsProcessor,
  [QUEUE_EMAIL_SEND]: EmailSendProcessor,
};

/** The real AppModule with only the email provider replaced. */
export async function createTestApp(): Promise<TestApp> {
  const fakeEmailProvider = new FakeEmailProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(fakeEmailProvider)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  await app.init();
  const worker = (queueName: string) => app.get(PROCESSORS[queueName]).worker;
  return {
    app,
    dataSource: app.get(DataSource),
    fakeEmailProvider,
    get: (token) => app.get(token),
    pauseQueue: (queueName) => worker(queueName).pause(true),
    resumeQueue: (queueName) => worker(queueName).resume(),
    close: () => app.close(),
  };
}
