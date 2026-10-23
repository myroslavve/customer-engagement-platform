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
    });
  }

  /** Once BullMQ gives up (attempts exhausted or unrecoverable), the message is failed with the error. */
  async process(job: Job<EmailSendJob, void, string>): Promise<void> {
    try {
      await this.emailService.send(job.data.messageId, job.attemptsStarted);
    } catch (error) {
      if (isFinalAttempt(job, error)) await this.failMessage(job, error);
      throw error;
    }
  }

  /** Logs before marking, so the original error is kept even if marking fails. */
  private async failMessage(job: Job<EmailSendJob, void, string>, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      { message: 'send-email failed', messageId: job.data.messageId, error: message },
      error instanceof Error ? error.stack : undefined,
    );
    await this.messageRepository.markFailed(job.data.messageId, message, job.attemptsStarted);
  }
}
