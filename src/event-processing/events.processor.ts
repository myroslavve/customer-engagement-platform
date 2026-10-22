import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppConfig } from '../config/app-config';
import { ProcessEventJob } from '../queues/jobs';
import { QUEUE_EVENTS } from '../queues/queue-names';
import { EventRepository } from '../workflows/event.repository';
import { ProfileRepository } from '../workflows/profile.repository';
import { TriggerService } from './trigger.service';
import { WaitingRunService } from './waiting-run.service';

@Processor(QUEUE_EVENTS)
export class EventsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    private readonly config: AppConfig,
    private readonly events: EventRepository,
    private readonly profiles: ProfileRepository,
    private readonly triggers: TriggerService,
    private readonly waitingRuns: WaitingRunService,
  ) {
    super();
  }

  /** The BullMQ worker is created by @nestjs/bullmq during module init; concurrency is set after. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.workerEventsConcurrency;
    this.logger.log(`Consuming "${QUEUE_EVENTS}" with concurrency ${this.worker.concurrency}`);
  }

  /** Throws on missing rows so BullMQ retries; producers enqueue after commit, so this is rare. */
  async process(job: Job<ProcessEventJob, void, string>): Promise<void> {
    const event = await this.events.findById(job.data.eventId);
    if (!event) throw new Error(`Event ${job.data.eventId} not found`);
    const profile = await this.profiles.findById(event.profileId);
    if (!profile) throw new Error(`Profile ${event.profileId} not found for event ${event.id}`);

    await this.triggers.startMatchingRuns(event, profile);
    await this.waitingRuns.resumeWaitingRuns(event, profile);
  }

  /** Fires on every failed attempt; BullMQ keeps only the final state, so log each one here. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ProcessEventJob> | undefined, error: Error): void {
    const attempts = job ? `attempt ${job.attemptsMade}/${job.opts.attempts ?? 1}` : 'unknown job';
    this.logger.error(
      `process-event ${job?.id} failed (${attempts}): ${error.message}`,
      error.stack,
    );
  }
}
