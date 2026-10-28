import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { MessageRepository } from '../messaging/message.repository';
import { RunDetails } from '../types/run-details.types';
import { ProfileRepository } from '../workflows/profile.repository';
import { RunStepRepository } from '../workflows/run-step.repository';
import { RunRepository } from '../workflows/run.repository';

/** Read-only view of runs as the engine left them: run row, step timeline, messages. */
@Injectable()
export class RunInspectorService {
  constructor(
    private readonly runRepository: RunRepository,
    private readonly runStepRepository: RunStepRepository,
    private readonly messageRepository: MessageRepository,
    private readonly profileRepository: ProfileRepository,
  ) {}

  async get(accountId: string, runId: string): Promise<RunDetails> {
    return this.withDetails(await this.findRunOrFail(accountId, runId));
  }

  /** Newest first; an unknown userId (external id) has no runs. */
  async list(accountId: string, userId: string | undefined, limit: number): Promise<RunDetails[]> {
    const profileId = userId ? await this.findProfileId(accountId, userId) : undefined;
    if (profileId === null) return [];
    const runs = await this.runRepository.findRecent(accountId, profileId, limit);
    return Promise.all(runs.map((run) => this.withDetails(run)));
  }

  async findRunOrFail(accountId: string, runId: string): Promise<WorkflowRun> {
    const run = await this.runRepository.findForAccount(runId, accountId);
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  private async findProfileId(accountId: string, userId: string): Promise<string | null> {
    const profile = await this.profileRepository.findByExternalId(accountId, userId);
    return profile?.id ?? null;
  }

  private async withDetails(run: WorkflowRun): Promise<RunDetails> {
    const [steps, messages] = await Promise.all([
      this.runStepRepository.findByRunId(run.id),
      this.messageRepository.findByRunId(run.id),
    ]);
    return { ...run, steps, messages };
  }
}
