import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../database/entities/profile.entity';
import { RunStep } from '../database/entities/run-step.entity';
import { UserEvent } from '../database/entities/user-event.entity';
import { WorkflowRun } from '../database/entities/workflow-run.entity';
import { WorkflowVersion } from '../database/entities/workflow-version.entity';
import { ConditionEvaluator } from './condition-evaluator';
import { EventRepository } from './event.repository';
import { ProfileRepository } from './profile.repository';
import { RunStepRepository } from './run-step.repository';
import { RunRepository } from './run.repository';
import { WorkflowRepository } from './workflow.repository';

const PROVIDERS = [
  ConditionEvaluator,
  WorkflowRepository,
  RunRepository,
  RunStepRepository,
  ProfileRepository,
  EventRepository,
];

@Module({
  imports: [TypeOrmModule.forFeature([Profile, UserEvent, WorkflowVersion, WorkflowRun, RunStep])],
  providers: PROVIDERS,
  exports: PROVIDERS,
})
export class WorkflowsModule {}
