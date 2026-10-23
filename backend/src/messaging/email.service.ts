import { Inject, Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { Message } from '../database/entities/message.entity';
import { Template } from '../database/entities/template.entity';
import { MessageReason } from '../enums/message-reason.enum';
import { MessageStatus } from '../enums/message-status.enum';
import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';
import { ProfileRepository } from '../workflows/profile.repository';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider';
import { EmailSendError } from './email-send.error';
import { MessageRepository } from './message.repository';
import { SendInProgressError } from './send-in-progress.error';
import { TemplateRenderer } from './template-renderer';
import { TemplateRepository } from './template.repository';

/**
 * How long a `sending` claim may still be active (claimForSending bumps updatedAt). Must exceed the
 * provider's request timeout (Resend: 30 s).
 */
const CLAIM_TIMEOUT_MS = 60_000;

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
    if (message.status === MessageStatus.Sending) return this.resolveClaim(message, attempt);
    if (message.status !== MessageStatus.Queued) return;

    if (message.toEmail === null) {
      return this.messageRepository.markSkipped(message.id, MessageReason.NoEmail, attempt);
    }
    if (await this.isUnsubscribed(message)) {
      return this.messageRepository.markSkipped(message.id, MessageReason.Unsubscribed, attempt);
    }
    const template = await this.findTemplate(message);
    if (!template) {
      return this.messageRepository.markFailed(message.id, MessageReason.TemplateNotFound, attempt);
    }

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
    this.logger.log({
      message: 'Email sent',
      messageId: message.id,
      providerMessageId: result.providerMessageId,
    });
  }

  /**
   * A stalled job can be re-run while its first worker is still sending. A claim younger than
   * CLAIM_TIMEOUT_MS may still be active, so the caller retries after it; an older one was
   * abandoned with an unknown outcome and is failed rather than resent.
   */
  private async resolveClaim(message: Message, attempt: number): Promise<void> {
    const abandonedAt = message.updatedAt.getTime() + CLAIM_TIMEOUT_MS;
    if (Date.now() < abandonedAt) throw new SendInProgressError(abandonedAt);
    await this.messageRepository.markFailed(message.id, MessageReason.SendInterrupted, attempt);
  }

  private async isUnsubscribed(message: Message): Promise<boolean> {
    const profile = await this.profileRepository.findByIdOrFail(message.profileId);
    return profile.unsubscribedAt !== null;
  }

  /** null when the template was deleted after the step queued the message (templateId SET NULL). */
  private async findTemplate(message: Message): Promise<Template | null> {
    if (message.templateId === null) return null;
    return this.templateRepository.findForAccount(message.templateId, message.accountId);
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
