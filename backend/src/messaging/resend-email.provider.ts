import { Resend } from 'resend';
import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';
import { EmailProvider } from './email-provider';
import { EmailSendError } from './email-send.error';

/** Definitively not sent, worth retrying later. */
const RETRYABLE_REJECTIONS = new Set(['rate_limit_exceeded']);
/**
 * The SDK reports its own network failures as application_error; a 500 is just as ambiguous, and
 * concurrent_idempotent_requests means a request with this key is still in flight and may succeed.
 */
const UNKNOWN_OUTCOMES = new Set([
  'application_error',
  'internal_server_error',
  'concurrent_idempotent_requests',
]);

export class ResendEmailProvider implements EmailProvider {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly fromAddress: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(email: RenderedEmail): Promise<SendResult> {
    const { data, error } = await this.resend.emails.send(
      { from: this.fromAddress, to: email.to, subject: email.subject, html: email.html },
      { idempotencyKey: email.idempotencyKey },
    );
    if (!error) return { providerMessageId: data?.id ?? null };

    const message = `Resend ${error.name}: ${error.message}`;
    if (UNKNOWN_OUTCOMES.has(error.name)) throw new Error(message);
    throw new EmailSendError(message, RETRYABLE_REJECTIONS.has(error.name));
  }
}
