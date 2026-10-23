/** workflow_runs.context: engine bookkeeping that is not worth its own columns. */
export type RunState = {
  /** The event that last touched the run (resume by event); the trigger event when absent. */
  lastEventId?: string;
  /** Why the run failed. */
  error?: string;
};
