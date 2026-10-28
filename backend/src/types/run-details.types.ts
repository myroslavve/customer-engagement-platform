import { Message } from '../database/entities/message.entity';
import { RunStep } from '../database/entities/run-step.entity';
import { WorkflowRun } from '../database/entities/workflow-run.entity';

/** A run with its step timeline and the messages it recorded (dev tools inspection). */
export type RunDetails = WorkflowRun & {
  steps: RunStep[];
  messages: Message[];
};
