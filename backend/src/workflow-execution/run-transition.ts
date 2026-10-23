import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { RunStatus } from '../enums/run-status.enum';
import { StepCause } from '../enums/step-cause.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { StepJob } from '../types/job.types';
import { RunStepOutput } from '../types/run-step-output.types';
import { StepResult, WaitStepResult } from '../types/step-result.types';

/**
 * Run state transitions caused by an executed step: running → waiting (wait node entered),
 * running → running at the next node, running → completed (no next node). Failure is the
 * separate RunRepository.markFailed; claim() moves waiting → running.
 */

/** Fixes when the follow-up job is due, so a retry re-enqueues with the time left. */
export function toStepOutput(result: StepResult, now: Date): RunStepOutput {
  const delayMs = result.kind === StepResultKind.Wait ? result.timeoutMs : result.delayMs;
  const dueAt = delayMs === undefined ? null : new Date(now.getTime() + delayMs).toISOString();
  return { result, dueAt };
}

export function applyStepOutput(
  run: WorkflowRun,
  job: StepJob,
  output: RunStepOutput,
  now: Date,
): void {
  run.claimKey = null;
  const { result, dueAt } = output;
  if (result.kind === StepResultKind.Wait) {
    startWaiting(run, result, dueAt);
    return;
  }
  // A branch after "wait for purchase" must see the purchase, not the trigger event.
  if (job.cause === StepCause.Event && job.eventId) {
    run.context = { ...run.context, lastEventId: job.eventId };
  }
  if (result.nextNodeId === null) complete(run, now);
  else moveTo(run, result.nextNodeId, dueAt);
}

function startWaiting(run: WorkflowRun, result: WaitStepResult, dueAt: string | null): void {
  run.status = RunStatus.Waiting;
  run.waitingForEvent = result.eventName;
  run.waitUntil = dueAt ? new Date(dueAt) : null;
}

function moveTo(run: WorkflowRun, nextNodeId: string, dueAt: string | null): void {
  run.currentNodeId = nextNodeId;
  run.waitingForEvent = null;
  run.waitUntil = dueAt ? new Date(dueAt) : null;
}

/** A trailing delay (next: null) has nothing left to wait for, so waitUntil is cleared too. */
function complete(run: WorkflowRun, now: Date): void {
  run.status = RunStatus.Completed;
  run.currentNodeId = null;
  run.waitingForEvent = null;
  run.waitUntil = null;
  run.finishedAt = now;
}
