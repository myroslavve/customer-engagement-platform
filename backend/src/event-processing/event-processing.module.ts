import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EventsProcessor } from './events.processor';
import { TriggerService } from './trigger.service';
import { WaitingRunService } from './waiting-run.service';

@Module({
  imports: [QueuesModule, WorkflowsModule],
  providers: [EventsProcessor, TriggerService, WaitingRunService],
})
export class EventProcessingModule {}
