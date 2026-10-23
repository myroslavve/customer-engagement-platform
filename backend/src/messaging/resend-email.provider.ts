import { Resend } from 'resend';
import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';
import { EmailProvider } from './email-provider';
import { EmailSendError } from './email-send.error';

/** Well under BullMQ's 30 s job lock, so a hung request cannot outlive its job. */
const REQUEST_TIMEOUT_MS = 10_000;

export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly fromAddress: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  /** A timeout aborts with a thrown error: outcome unknown. */
  async send(email: RenderedEmail): Promise<SendResult> {
    const { data, error } = await this.resend.emails.send(
      { from: this.fromAddress, to: email.to, subject: email.subject, html: email.html },
      { idempotencyKey: email.idempotencyKey, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!error) return { providerMessageId: data?.id ?? null };

    const message = `Resend ${error.name}: ${error.message}`;
    if (this.isOutcomeUnknown(error.name, error.statusCode)) throw new Error(message);
    throw new EmailSendError(message, error.name === 'rate_limit_exceeded');
  }

  /**
   * No status (the SDK's network failure) or a 5xx: the email may have been sent. So may it when a
   * request with the same idempotency key is still in flight. Any other 4xx was rejected.
   */
  private isOutcomeUnknown(name: string, statusCode: number | null): boolean {
    return statusCode === null || statusCode >= 500 || name === 'concurrent_idempotent_requests';
  }
}
