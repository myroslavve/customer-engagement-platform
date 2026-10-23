import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { Message } from '../database/entities/message.entity';
import { Template } from '../database/entities/template.entity';
import { MessageStatus } from '../enums/message-status.enum';
import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';
import { ProfileRepository } from '../workflows/profile.repository';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider';
import { EmailSendError } from './email-send.error';
import { MessageRepository } from './message.repository';
import { TemplateRenderer } from './template-renderer';
import { TemplateRepository } from './template.repository';

export const SKIP_NO_EMAIL = 'no_email';
export const SKIP_UNSUBSCRIBED = 'unsubscribed';
export const FAIL_TEMPLATE_NOT_FOUND = 'template_not_found';
export const FAIL_SEND_INTERRUPTED = 'send_interrupted';

/**
 * At-most-once delivery: the message is claimed (`sending`) before the provider call. A definitive
 * rejection releases it for a retry; an unknown outcome leaves it `sending`, and the next attempt
 * fails it instead of risking a duplicate.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly templateRepository: TemplateRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly templateRenderer: TemplateRenderer,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  async send(messageId: string, attempt: number): Promise<void> {
    const message = await this.messageRepository.findByIdOrFail(messageId);
    if (message.status === MessageStatus.Sending) return this.failInterrupted(message, attempt);
    if (message.status !== MessageStatus.Queued) return;

    if (message.toEmail === null) return this.skip(message, SKIP_NO_EMAIL, attempt);
    if (await this.isUnsubscribed(message)) return this.skip(message, SKIP_UNSUBSCRIBED, attempt);
    const template = await this.findTemplate(message);
    if (!template) return this.failTemplateNotFound(message, attempt);

    const rendered = this.templateRenderer.render(
      template,
      message.toEmail,
      message.variables,
      message.id,
    );
    if (!(await this.messageRepository.claimForSending(message.id))) return;
    const result = await this.deliver(message, rendered);
    await this.messageRepository.markSent(
      message.id,
      result.providerMessageId,
      rendered.subject,
      attempt,
    );
  }

  /** A previous attempt died between the provider call and markSent: sending again could duplicate. */
  private async failInterrupted(message: Message, attempt: number): Promise<void> {
    this.logger.warn({
      message: 'Message send interrupted on a previous attempt, not resending',
      messageId: message.id,
      attempt,
    });
    await this.messageRepository.markFailed(message.id, FAIL_SEND_INTERRUPTED, attempt);
  }

  private async skip(message: Message, reason: string, attempt: number): Promise<void> {
    this.logger.log({ message: 'Message skipped', messageId: message.id, reason });
    await this.messageRepository.markSkipped(message.id, reason, attempt);
  }

  private async isUnsubscribed(message: Message): Promise<boolean> {
    const profile = await this.profileRepository.findByIdOrFail(message.profileId);
    return profile.unsubscribedAt !== null;
  }

  /** templateId is null when the template was deleted after the step queued the message. */
  private async findTemplate(message: Message): Promise<Template | null> {
    if (message.templateId === null) return null;
    return this.templateRepository.findById(message.templateId);
  }

  private async failTemplateNotFound(message: Message, attempt: number): Promise<void> {
    this.logger.warn({ message: 'Message template not found', messageId: message.id });
    await this.messageRepository.markFailed(message.id, FAIL_TEMPLATE_NOT_FOUND, attempt);
  }

  /**
   * EmailSendError means nothing was sent: release the message so a retry really sends it (or
   * fail it at once when the rejection is permanent). Any other error leaves it `sending`.
   */
  private async deliver(message: Message, rendered: RenderedEmail): Promise<SendResult> {
    try {
      return await this.emailProvider.send(rendered);
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error;
      await this.messageRepository.releaseSending(message.id);
      throw error.retryable ? error : new UnrecoverableError(error.message);
    }
  }
}
