import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';
import { EmailProvider } from './email-provider';

/** Development provider: logs recipient and subject, never fails. */
export class LogEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LogEmailProvider.name);

  async send(email: RenderedEmail): Promise<SendResult> {
    const providerMessageId = `log-${randomUUID()}`;
    this.logger.log({
      message: 'Email sent (log provider)',
      to: email.to,
      subject: email.subject,
      providerMessageId,
    });
    return { providerMessageId };
  }
}
