/** How the runner arrived at a node. The values are part of step job ids. */
export enum StepCause {
  /** Normal progression into the node (immediate or after a delay). */
  Enter = 'enter',
  /** A waiting run was resumed by `eventId` (take `next` of the wait node). */
  Event = 'event',
  /** The delayed timeout job of a wait_for_event node fired (take `timeoutNext`). */
  Timeout = 'timeout',
}
