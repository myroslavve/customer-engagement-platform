import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { JobState, Queue } from 'bullmq';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../../src/queues/queue-names';
import { waitFor } from './wait-for';

const QUEUE_NAMES = [QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS, QUEUE_EMAIL_SEND];

type JobStateOrUnknown = JobState | 'unknown';

export function getQueue(app: INestApplication, queueName: string): Queue {
  return app.get<Queue>(getQueueToken(queueName));
}

export async function obliterateQueues(app: INestApplication): Promise<void> {
  for (const name of QUEUE_NAMES) await getQueue(app, name).obliterate({ force: true });
}

/** Re-adding a retained job id is a BullMQ no-op, so remove it first; then the processor runs it again. */
export async function reprocessJob(
  app: INestApplication,
  queueName: string,
  jobId: string,
): Promise<void> {
  const queue = getQueue(app, queueName);
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found in queue ${queueName}`);
  const { name, data } = job;
  await job.remove();
  await queue.add(name, data, { jobId });
}

export function getJobState(
  app: INestApplication,
  queueName: string,
  jobId: string,
): Promise<JobStateOrUnknown> {
  return getQueue(app, queueName)
    .getJob(jobId)
    .then((job) => job?.getState() ?? 'unknown');
}

export function waitForJobState(
  app: INestApplication,
  queueName: string,
  jobId: string,
  state: JobState,
): Promise<JobStateOrUnknown> {
  return waitFor(
    () => getJobState(app, queueName, jobId),
    (current) => current === state,
  );
}
