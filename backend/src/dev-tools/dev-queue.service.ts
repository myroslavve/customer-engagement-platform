import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from '../queues/queue-names';
import { EmailSendJob, ProcessEventJob, StepJob } from '../types/job.types';
import { QueueStats } from '../types/queue-stats.types';

/** Queue inspection and time travel for local testing; never used by the engine itself. */
@Injectable()
export class DevQueueService {
  private readonly logger = new Logger(DevQueueService.name);

  constructor(
    @InjectQueue(QUEUE_EVENTS) private readonly eventsQueue: Queue<ProcessEventJob>,
    @InjectQueue(QUEUE_WORKFLOW_STEPS) private readonly stepsQueue: Queue<StepJob>,
    @InjectQueue(QUEUE_EMAIL_SEND) private readonly emailQueue: Queue<EmailSendJob>,
  ) {}

  stats(): Promise<QueueStats[]> {
    const queues: Queue[] = [this.eventsQueue, this.stepsQueue, this.emailQueue];
    return Promise.all(
      queues.map(async (queue) => ({ queue: queue.name, counts: await queue.getJobCounts() })),
    );
  }

  /**
   * Moves the run's delayed step jobs (a delay's next node, a wait's timeout) to waiting, so they
   * run now. The engine does not compare times, so a promoted timeout behaves as a real one.
   */
  async fastForward(runId: string): Promise<number> {
    const delayed = await this.stepsQueue.getDelayed();
    const jobs = delayed.filter((job) => job.data.runId === runId);
    await Promise.all(jobs.map((job) => job.promote()));
    this.logger.log({ message: 'Run fast-forwarded', runId, promoted: jobs.length });
    return jobs.length;
  }
}
