import { Injectable } from '@nestjs/common';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { StepCause } from '../enums/step-cause.enum';
import { StepJob } from '../types/job.types';
import { RunContext } from '../types/run-context.types';
import { EventRepository } from '../workflows/event.repository';
import { ProfileRepository } from '../workflows/profile.repository';
import { buildRunContext } from '../workflows/run-context';

/** Builds the RunContext executors and conditions see for one step. */
@Injectable()
export class StepContextBuilder {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly eventRepository: EventRepository,
  ) {}

  async build(run: WorkflowRun, job: StepJob): Promise<RunContext> {
    const profile = await this.profileRepository.findByIdOrFail(run.profileId);
    const event = await this.eventRepository.findByIdOrFail(this.contextEventId(run, job));
    return buildRunContext(profile, event);
  }

  /** The event that last touched the run: the resuming event, the last one stored, or the trigger. */
  private contextEventId(run: WorkflowRun, job: StepJob): string {
    if (job.cause === StepCause.Event && job.eventId) return job.eventId;
    return run.context.lastEventId ?? run.triggerEventId;
  }
}
