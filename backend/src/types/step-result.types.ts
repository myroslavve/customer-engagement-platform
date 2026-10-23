import { StepResultKind } from '../enums/step-result-kind.enum';

export type AdvanceStepResult = {
  kind: StepResultKind.Advance;
  /** null completes the run. */
  nextNodeId: string | null;
  /** Enter the next node after this delay (delay nodes). */
  delayMs?: number;
};

export type WaitStepResult = {
  kind: StepResultKind.Wait;
  eventName: string;
  timeoutMs: number;
};

export type StepResult = AdvanceStepResult | WaitStepResult;
