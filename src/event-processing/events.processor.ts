import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.schema';
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
    private readonly configService: ConfigService<Env, true>,
    private readonly eventRepository: EventRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly triggerService: TriggerService,
    private readonly waitingRunService: WaitingRunService,
  ) {
    super();
  }

  /** The BullMQ worker is created by @nestjs/bullmq during module init; concurrency is set after. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.configService.get('EVENTS_QUEUE_CONCURRENCY', { infer: true });
    this.logger.log('Consuming queue', {
      queue: QUEUE_EVENTS,
      concurrency: this.worker.concurrency,
    });
  }

  /** Throws on missing rows so BullMQ retries; producers enqueue after commit, so this is rare. */
  async process(job: Job<ProcessEventJob, void, string>): Promise<void> {
    const event = await this.eventRepository.findById(job.data.eventId);
    if (!event) throw new Error(`Event ${job.data.eventId} not found`);
    const profile = await this.profileRepository.findById(event.profileId);
    if (!profile) throw new Error(`Profile ${event.profileId} not found for event ${event.id}`);

    await this.triggerService.startMatchingRuns(event, profile);
    await this.waitingRunService.resumeWaitingRuns(event, profile);
  }

  /** Fires on every failed attempt; BullMQ keeps only the final state, so log each one here. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ProcessEventJob> | undefined, error: Error): void {
    this.logger.error(
      'process-event attempt failed',
      {
        jobId: job?.id,
        attempt: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        error: error.message,
      },
      error.stack,
    );
  }
}
