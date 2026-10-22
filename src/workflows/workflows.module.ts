import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENTITIES } from '../database/entities';
import { ConditionEvaluator } from './condition-evaluator';
import { EventRepository } from './event.repository';
import { ProfileRepository } from './profile.repository';
import { RunRepository } from './run.repository';
import { WorkflowRepository } from './workflow.repository';

const PROVIDERS = [
  ConditionEvaluator,
  WorkflowRepository,
  RunRepository,
  ProfileRepository,
  EventRepository,
];

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES)],
  providers: PROVIDERS,
  exports: PROVIDERS,
})
export class WorkflowsModule {}
