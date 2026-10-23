/** What a StepExecutor decided: move on (possibly after a delay, possibly to nothing) or wait for an event. */
export enum StepResultKind {
  Advance = 'advance',
  Wait = 'wait',
}
