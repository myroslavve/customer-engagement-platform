import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, Job, Queue } from 'bullmq';
import { AppConfig } from '../config/configuration';
import { MessageStatus } from '../enums/message-status.enum';
import { isFinalAttempt } from '../queues/job-attempts';
import { QUEUE_EMAIL_SEND } from '../queues/queue-names';
import { EmailSendJob } from '../types/job.types';
import { EmailService } from './email.service';
import { MessageRepository } from './message.repository';
import { SendInProgressError } from './send-in-progress.error';

/**
 * Resend allows 2 requests/second. A decorator constant because @nestjs/bullmq builds the worker
 * from static decorator metadata.
 */
export const EMAIL_SEND_RATE_LIMIT = { max: 2, duration: 1000 };

@Processor(QUEUE_EMAIL_SEND, { limiter: EMAIL_SEND_RATE_LIMIT })
export class EmailSendProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly emailService: EmailService,
    private readonly messageRepository: MessageRepository,
    @InjectQueue(QUEUE_EMAIL_SEND) private readonly emailQueue: Queue<EmailSendJob>,
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
  async process(job: Job<EmailSendJob, void, string>, token?: string): Promise<void> {
    try {
      await this.emailService.send(job.data.messageId, job.attemptsStarted);
    } catch (error) {
      if (error instanceof SendInProgressError) return this.postpone(job, error, token);
      if (isFinalAttempt(job, error)) await this.failMessage(job, error);
      throw error;
    }
  }

  /**
   * A job that stalls more than maxStalledCount times is failed by BullMQ without calling process(),
   * so its message would stay queued or sending forever. Errors here are logged, not thrown.
   */
  @OnWorkerEvent('stalled')
  async onStalled(jobId: string): Promise<void> {
    try {
      await this.settleStalled(jobId);
    } catch (error) {
      this.logger.error(
        { message: 'Settling a stalled send-email job failed', jobId },
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Only for jobs BullMQ failed (otherwise it re-queued them and process() runs again). A queued
   * message never reached the provider and is failed; a sending one is retried, and that run only
   * resolves the claim (postpone or send_interrupted), it never calls the provider.
   */
  private async settleStalled(jobId: string): Promise<void> {
    const job = await this.emailQueue.getJob(jobId);
    if (!job || !(await job.isFailed())) return;
    const message = await this.messageRepository.findById(job.data.messageId);
    if (message?.status === MessageStatus.Queued) {
      return this.messageRepository.markFailed(message.id, job.failedReason, job.attemptsStarted);
    }
    if (message?.status === MessageStatus.Sending) await job.retry('failed');
  }

  /** Re-checks the message once the other worker's claim may be abandoned; uses up no attempt. */
  private async postpone(
    job: Job<EmailSendJob, void, string>,
    error: SendInProgressError,
    token?: string,
  ): Promise<void> {
    await job.moveToDelayed(error.retryAt, token);
    throw new DelayedError();
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
