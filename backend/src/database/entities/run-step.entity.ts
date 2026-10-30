import { Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { NodeType } from '../../enums/node-type.enum';
import { RunStepStatus } from '../../enums/run-step-status.enum';
import { StepCause } from '../../enums/step-cause.enum';
import type { RunStepOutput } from '../../types/run-step-output.types';
import { AbstractEntity } from './abstract.entity';
import { WorkflowRun } from './workflow-run.entity';

/** One row per executed node visit: the step timeline of the activity log. jobId is the BullMQ job id. */
@Entity({ name: 'run_steps' })
@Unique('uq_run_steps_job_id', ['jobId'])
@Index('ix_run_steps_run_created', ['runId', 'createdAt'])
export class RunStep extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => WorkflowRun, { name: 'fk_run_steps_run_id' })
  runId: string;
  @Column('text') jobId: string;
  @Column('text') nodeId: string;
  // text, not a PG enum: new node kinds must not need ALTER TYPE.
  @Column({ type: 'text', nullable: true }) nodeType: NodeType | null;
  @Column('text') cause: StepCause;
  // varchar, not a PG enum: a new status must not need ALTER TYPE.
  @Column('varchar') status: RunStepStatus;
  @Column({ type: 'jsonb', nullable: true }) output: RunStepOutput | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
}
