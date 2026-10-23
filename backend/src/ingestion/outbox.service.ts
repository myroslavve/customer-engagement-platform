import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { QueueProducer } from '../queues/queue-producer';
import { EventOutboxRepository } from './event-outbox.repository';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 100;

/**
 * Re-publishes process-event for outbox rows and deletes them. Covers a crash or Redis failure
 * between the event commit and the enqueue; re-adding a job that was already queued is a no-op
 * (deterministic jobId).
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly eventOutboxRepository: EventOutboxRepository,
    private readonly queueProducer: QueueProducer,
  ) {}

  onModuleInit(): void {
    void this.publishPending();
    this.timer = setInterval(() => void this.publishPending(), POLL_INTERVAL_MS);
  }

  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.eventOutboxRepository.findPending(BATCH_SIZE);
      for (const entry of pending) {
        try {
          await this.queueProducer.enqueueProcessEvent({ eventId: entry.eventId });
          await this.eventOutboxRepository.removeByEventId(entry.eventId);
        } catch (error) {
          this.logger.error(
            { message: 'Failed to publish event outbox entry', eventId: entry.eventId },
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        { message: 'Event outbox publish failed' },
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
