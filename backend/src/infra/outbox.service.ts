import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { QueueService } from './queue.service';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly queue: QueueService
  ) {}

  onModuleInit(): void {
    void this.publishPending().catch((error) => {
      this.logger.error(
        { message: 'Initial event outbox publish failed' },
        error instanceof Error ? error.stack : undefined
      );
    });
    this.timer = setInterval(() => void this.publishPending(), 5_000);
  }

  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { rows } = await this.database.query<{ event_id: string }>(
        'SELECT event_id FROM event_outbox ORDER BY created_at LIMIT 100'
      );
      for (const row of rows) {
        try {
          await this.queue.publishProcessEvent(row.event_id);
          await this.database.query('DELETE FROM event_outbox WHERE event_id = $1', [
            row.event_id
          ]);
        } catch (error) {
          this.logger.error(
            { message: 'Failed to publish event outbox entry', eventId: row.event_id },
            error instanceof Error ? error.stack : undefined
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
