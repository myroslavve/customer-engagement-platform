/** The provider rejected the email and did not send it. retryable: worth trying again later (e.g. rate limit). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}
