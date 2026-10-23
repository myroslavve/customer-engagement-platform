import { RenderedEmail } from '../types/rendered-email.types';
import { SendResult } from '../types/send-result.types';

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Sends one email. Throw EmailSendError when the provider definitively rejected it (nothing was
 * sent); throw anything else when the outcome is unknown (network failure after the request left).
 */
export interface EmailProvider {
  send(email: RenderedEmail): Promise<SendResult>;
}
