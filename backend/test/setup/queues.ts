import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { JobState, Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../src/queues/queue-names';
import { waitFor } from './wait-for';

type JobStateOrUnknown = JobState | 'unknown';

const SETTLED_STATES: JobStateOrUnknown[] = ['completed', 'failed'];

export function getQueue(app: INestApplication, queueName: string): Queue {
  return app.get<Queue>(getQueueToken(queueName));
}

export async function obliterateQueues(app: INestApplication): Promise<void> {
  for (const name of QUEUE_NAMES) await getQueue(app, name).obliterate({ force: true });
}

/**
 * Re-adding a retained job id is a BullMQ no-op, so remove it first; then the processor runs it
 * again. Waits until the job settled: an active job is locked and cannot be removed, and the
 * database may already show its outcome while BullMQ has not moved it to completed yet.
 */
export async function reprocessJob(
  app: INestApplication,
  queueName: string,
  jobId: string,
): Promise<void> {
  await waitFor(
    () => getJobState(app, queueName, jobId),
    (state) => SETTLED_STATES.includes(state),
  );
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
