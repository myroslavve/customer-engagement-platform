/** Another worker holds a fresh `sending` claim on the message; look again once it may be abandoned. */
export class SendInProgressError extends Error {
  constructor(readonly retryAt: number) {
    super('Message send in progress on another worker');
    this.name = 'SendInProgressError';
  }
}
