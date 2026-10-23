export type RenderedEmail = {
  to: string;
  subject: string;
  html: string;
  /** The message id; providers that support idempotency keys pass it through. */
  idempotencyKey: string;
};
