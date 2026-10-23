/** Why a message was skipped or failed without a provider error; stored in messages.error. */
export enum MessageReason {
  NoEmail = 'no_email',
  Unsubscribed = 'unsubscribed',
  TemplateNotFound = 'template_not_found',
  /** A previous attempt reached the provider with an unknown outcome; not resent (at most once). */
  SendInterrupted = 'send_interrupted',
}
