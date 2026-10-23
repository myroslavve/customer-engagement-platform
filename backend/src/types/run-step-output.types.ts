import { StepResult } from './step-result.types';

/** run_steps.output of a completed step. */
export type RunStepOutput = {
  result: StepResult;
  /** ISO time the follow-up job is due (delays, wait timeouts); null when immediate or none. */
  dueAt: string | null;
};
