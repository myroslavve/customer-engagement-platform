/** queued → sending → sent | failed; queued → skipped | failed. `sending` is claimed right before the provider call. */
export enum MessageStatus {
  Queued = 'queued',
  Sending = 'sending',
  Sent = 'sent',
  Failed = 'failed',
  Skipped = 'skipped',
}
