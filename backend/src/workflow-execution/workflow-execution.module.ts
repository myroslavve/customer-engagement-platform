import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { BranchStepExecutor } from './branch-step.executor';
import { DelayStepExecutor } from './delay-step.executor';
import { ExitStepExecutor } from './exit-step.executor';
import { StepExecutorRegistry } from './step-executor.registry';
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
    WorkflowRunner,
    StepsProcessor,
  ],
  exports: [StepExecutorRegistry],
})
export class WorkflowExecutionModule {}
