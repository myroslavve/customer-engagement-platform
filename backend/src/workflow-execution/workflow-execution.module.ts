import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { BranchStepExecutor } from './branch-step.executor';
import { DelayStepExecutor } from './delay-step.executor';
import { ExitStepExecutor } from './exit-step.executor';
import { FollowUpScheduler } from './follow-up.scheduler';
import { StepContextBuilder } from './step-context.builder';
import { StepExecutorRegistry } from './step-executor.registry';
import { StepNodeResolver } from './step-node.resolver';
import { StepOwnershipService } from './step-ownership.service';
import { StepRecorder } from './step-recorder';
import { StepsProcessor } from './steps.processor';
import { WaitForEventStepExecutor } from './wait-for-event-step.executor';
import { WorkflowRunner } from './workflow-runner';

/** Executors are providers so Nest constructs them (and they self-register) before any hook runs. */
@Module({
  imports: [QueuesModule, WorkflowsModule],
  providers: [
    StepExecutorRegistry,
    BranchStepExecutor,
    DelayStepExecutor,
    WaitForEventStepExecutor,
    ExitStepExecutor,
    StepOwnershipService,
    StepNodeResolver,
    StepContextBuilder,
    StepRecorder,
    FollowUpScheduler,
    WorkflowRunner,
    StepsProcessor,
  ],
  exports: [StepExecutorRegistry],
})
export class WorkflowExecutionModule {}
