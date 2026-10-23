import { describe, expect, it } from 'vitest';
import { StepCause } from '../enums/step-cause.enum';
import { eventClaimSuffix, stepJobId } from './jobs';

describe('stepJobId', () => {
  it('joins run, node and cause for enter and timeout steps', () => {
    expect(stepJobId({ runId: 'R', nodeId: 'wait', cause: StepCause.Enter })).toBe(
      'R__wait__enter',
    );
    expect(stepJobId({ runId: 'R', nodeId: 'wait', cause: StepCause.Timeout })).toBe(
      'R__wait__timeout',
    );
  });

  it('appends the event id for event steps', () => {
    expect(stepJobId({ runId: 'R', nodeId: 'wait', cause: StepCause.Event, eventId: 'E' })).toBe(
      'R__wait__event__E',
    );
  });

  it('ends event step ids with eventClaimSuffix, which findWaiting matches claim keys on', () => {
    const jobId = stepJobId({ runId: 'R', nodeId: 'wait', cause: StepCause.Event, eventId: 'E' });
    expect(jobId.endsWith(eventClaimSuffix('E'))).toBe(true);
    expect(jobId.endsWith(eventClaimSuffix('other'))).toBe(false);
  });
});
