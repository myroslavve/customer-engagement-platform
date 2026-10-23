import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { AppConfig } from '../config/configuration';
import { isFinalAttempt } from '../queues/job-attempts';
import { QUEUE_EMAIL_SEND } from '../queues/queue-names';
import { EmailSendJob } from '../types/job.types';
import { EmailService } from './email.service';
import { MessageRepository } from './message.repository';

/**
 * Resend allows 2 requests/second. A decorator constant because @nestjs/bullmq builds the worker
 * from static decorator metadata; harmless for the log provider.
 */
export const EMAIL_SEND_RATE_LIMIT = { max: 2, duration: 1000 };

@Processor(QUEUE_EMAIL_SEND, { limiter: EMAIL_SEND_RATE_LIMIT })
export class EmailSendProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly emailService: EmailService,
    private readonly messageRepository: MessageRepository,
  ) {
    super();
  }

  /** The BullMQ worker is created by @nestjs/bullmq during module init; concurrency is set after. */
  onApplicationBootstrap(): void {
    this.worker.concurrency = this.configService.get('email', { infer: true }).concurrency;
    this.logger.log({
      message: 'Consuming queue',
      queue: QUEUE_EMAIL_SEND,
      concurrency: this.worker.concurrency,
      rateLimit: EMAIL_SEND_RATE_LIMIT,
    });
  }

  /** Once BullMQ gives up (attempts exhausted or unrecoverable), the message is failed with the error. */
  async process(job: Job<EmailSendJob, void, string>): Promise<void> {
    try {
      await this.emailService.send(job.data.messageId, job.attemptsStarted);
    } catch (error) {
      const final = isFinalAttempt(job, error);
      this.logAttemptFailed(job, error, final);
      if (final) await this.failMessage(job, error);
      throw error;
    }
  }

  private async failMessage(job: Job<EmailSendJob, void, string>, error: unknown): Promise<void> {
    await this.messageRepository.markFailed(
      job.data.messageId,
      errorMessage(error),
      job.attemptsStarted,
    );
  }

  /** Retried attempts log at warn; only the last one (or an unrecoverable error) at error. */
  private logAttemptFailed(
    job: Job<EmailSendJob, void, string>,
    error: unknown,
    final: boolean,
  ): void {
    const details = {
      jobId: job.id,
      messageId: job.data.messageId,
      attempt: job.attemptsStarted,
      maxAttempts: job.opts.attempts ?? 1,
      error: errorMessage(error),
    };
    if (!final) {
      this.logger.warn({ ...details, message: 'send-email attempt failed, will retry' });
      return;
    }
    this.logger.error(
      { ...details, message: 'send-email failed' },
      error instanceof Error ? error.stack : undefined,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
