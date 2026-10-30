import { WorkerHost } from '@nestjs/bullmq';
import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EventsProcessor } from '../../src/event-processing/events.processor';
import { EMAIL_PROVIDER } from '../../src/messaging/email-provider';
import { EmailSendProcessor } from '../../src/messaging/email-send.processor';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../../src/queues/queue-names';
import { RedisService } from '../../src/redis/redis.service';
import { StepsProcessor } from '../../src/workflow-execution/steps.processor';
import { truncateAll } from './database';
import { FakeEmailProvider } from './fake-email-provider';
import { HttpClient } from './http-client';
import { obliterateQueues } from './queues';

export type TestApp = {
  app: INestApplication;
  dataSource: DataSource;
  fakeEmailProvider: FakeEmailProvider;
  get<T>(token: Type<T>): T;
  /** Serves HTTP on a random port (once) and returns a client for it. */
  http(): Promise<HttpClient>;
  /** Stops the queue's worker from taking jobs (they stay waiting/delayed); resumeQueue undoes it. */
  pauseQueue(queueName: string): Promise<void>;
  resumeQueue(queueName: string): void;
  /** Empties queues, tables and the fake provider; workers paused by the test stay paused. */
  reset(): Promise<void>;
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
  // Many cases fail jobs on purpose; their logs would bury real failures (assertions carry the state).
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  const workers = Object.values(PROCESSORS).map((processor) => app.get(processor).worker);
  const worker = (queueName: string) => app.get(PROCESSORS[queueName]).worker;
  const dataSource = app.get(DataSource);
  let httpClient: HttpClient | undefined;
  return {
    app,
    dataSource,
    fakeEmailProvider,
    get: (token) => app.get(token),
    http: async () => (httpClient ??= await listen(app)),
    // Not pause(true): that leaves the in-flight blocking fetch running, which still takes one job.
    pauseQueue: (queueName) => worker(queueName).pause(),
    resumeQueue: (queueName) => worker(queueName).resume(),
    reset: () => reset(app, dataSource, fakeEmailProvider, workers),
    close: () => app.close(),
  };
}

async function listen(app: INestApplication): Promise<HttpClient> {
  await app.listen(0, '127.0.0.1');
  return new HttpClient(await app.getUrl());
}

/** The 24 h ingestion messageId claims; they outlive the rows they guarded. */
async function clearIdempotencyClaims(redisService: RedisService): Promise<void> {
  const keys = await redisService.client.keys('idempotency:*');
  if (keys.length > 0) await redisService.client.del(...keys);
}

/**
 * Workers are paused first (pause() waits for active jobs), so no job of the previous test runs
 * against the freshly truncated tables.
 */
async function reset(
  app: INestApplication,
  dataSource: DataSource,
  fakeEmailProvider: FakeEmailProvider,
  workers: Worker[],
): Promise<void> {
  const running = workers.filter((worker) => !worker.isPaused());
  await Promise.all(running.map((worker) => worker.pause()));
  try {
    await obliterateQueues(app);
    await clearIdempotencyClaims(app.get(RedisService));
    await truncateAll(dataSource);
    fakeEmailProvider.reset();
  } finally {
    running.forEach((worker) => worker.resume());
  }
}
