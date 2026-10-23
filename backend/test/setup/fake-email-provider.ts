import { EmailProvider } from '../../src/messaging/email-provider';
import { EmailSendError } from '../../src/messaging/email-send.error';
import { RenderedEmail } from '../../src/types/rendered-email.types';
import { SendResult } from '../../src/types/send-result.types';

type PlannedOutcome = () => void;

/** Records sends; can be told to reject (definitive) or crash (unknown outcome) on the next calls. */
export class FakeEmailProvider implements EmailProvider {
  sent: RenderedEmail[] = [];
  calls = 0;
  private plan: PlannedOutcome[] = [];

  /** The next calls throw EmailSendError: nothing was sent. */
  rejectNext(count: number, retryable = true): void {
    this.planNext(count, () => {
      throw new EmailSendError('fake rejection', retryable);
    });
  }

  /** The next calls throw a plain Error: the outcome is unknown. */
  crashNext(count: number): void {
    this.planNext(count, () => {
      throw new Error('fake crash');
    });
  }

  reset(): void {
    this.sent = [];
    this.calls = 0;
    this.plan = [];
  }

  async send(email: RenderedEmail): Promise<SendResult> {
    this.calls++;
    this.plan.shift()?.();
    this.sent.push(email);
    return { providerMessageId: `fake-${this.calls}` };
  }

  private planNext(count: number, outcome: PlannedOutcome): void {
    for (let i = 0; i < count; i++) this.plan.push(outcome);
  }
}
