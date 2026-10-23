import 'dotenv/config';
import { Queue } from 'bullmq';
import { envSchema } from '../src/config/env.schema';
import { JOB_PROCESS_EVENT, processEventJobId } from '../src/queues/jobs';
import { QUEUE_EVENTS } from '../src/queues/queue-names';
import { DEFAULT_JOB_OPTIONS } from '../src/queues/queues.module';

async function main(): Promise<void> {
  const eventId = process.argv[2];
  if (!eventId) {
    console.error('Usage: npm run enqueue:event -- <eventId>');
    process.exit(2);
  }
  const { REDIS_URL } = envSchema.parse(process.env);
  const queue = new Queue(QUEUE_EVENTS, {
    connection: REDIS_URL,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });
  const job = await queue.add(
    JOB_PROCESS_EVENT,
    { eventId },
    { jobId: processEventJobId({ eventId }) },
  );
  console.log('Enqueued job', { name: job.name, id: job.id });
  await queue.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
