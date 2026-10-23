import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, UnrecoverableError } from 'bullmq';
import { AppConfig } from '../config/configuration';
import { ProcessEventJob } from '../types/job.types';
import { QUEUE_EVENTS } from '../queues/queue-names';
import { EventRepository } from '../workflows/event.repository';
import { ProfileRepository } from '../workflows/profile.repository';
import { TriggerService } from './trigger.service';
import { WaitingRunService } from './waiting-run.service';

@Processor(QUEUE_EVENTS)
export class EventsProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventsProcessor.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly eventRepository: EventRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly triggerService: TriggerService,
    private readonly waitingRunService: WaitingRunService,
  ) {
    super();
  }

  /** The BullMQ worker is created by @nestjs/bullmq during module init; concurrency is set after. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.configService.get('queue', { infer: true }).eventsConcurrency;
    this.logger.log({
      message: 'Consuming queue',
      queue: QUEUE_EVENTS,
      concurrency: this.worker.concurrency,
    });
  }

  /**
   * Logs and rethrows every failure; retries and backoff come from the queue's DEFAULT_JOB_OPTIONS.
   * Missing rows throw too: producers enqueue after commit, so that is rare and worth retrying.
   */
  async process(job: Job<ProcessEventJob, void, string>): Promise<void> {
    try {
      await this.processEvent(job.data.eventId);
    } catch (error) {
      this.logger.error(
        {
          message: 'process-event attempt failed',
          jobId: job.id,
          eventId: job.data.eventId,
          attempt: job.attemptsStarted,
          maxAttempts: job.opts.attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async processEvent(eventId: string): Promise<void> {
    const event = await this.eventRepository.findById(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);
    const profile = await this.profileRepository.findById(event.profileId);
    if (!profile) throw new Error(`Profile ${event.profileId} not found for event ${event.id}`);
    // FKs are single-column, so only this check stops a producer bug from starting cross-tenant
    // runs. Retrying cannot fix it, so the job fails at once.
    if (profile.accountId !== event.accountId) {
      throw new UnrecoverableError(
        `Profile ${profile.id} does not belong to account ${event.accountId} of event ${event.id}`,
      );
    }

    await this.triggerService.startMatchingRuns(event, profile);
    await this.waitingRunService.resumeWaitingRuns(event, profile);
  }
}
