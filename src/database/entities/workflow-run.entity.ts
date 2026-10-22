import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum RunStatus {
  Running = 'running',
  Waiting = 'waiting',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

/** The partial unique index on live runs per (workflow, profile) lives in the migration only. */
@Entity({ name: 'workflow_runs' })
@Unique('uq_workflow_runs_version_trigger_event', ['workflowVersionId', 'triggerEventId'])
@Index('ix_workflow_runs_profile_status', ['profileId', 'status'])
export class WorkflowRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') accountId: string;
  @Column('uuid') workflowId: string;
  @Column('uuid') workflowVersionId: string;
  @Column('uuid') profileId: string;
  @Column('uuid') triggerEventId: string;
  @Column({ type: 'enum', enum: RunStatus, enumName: 'workflow_run_status' }) status: RunStatus;
  @Column({ type: 'text', nullable: true }) currentNodeId: string | null;
  @Column({ type: 'text', nullable: true }) waitingForEvent: string | null;
  @Column({ type: 'timestamptz', nullable: true }) waitUntil: Date | null;
  @Column({ type: 'text', nullable: true }) claimKey: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) context: Record<string, unknown>;
  @Column({ type: 'timestamptz', default: () => 'now()' }) startedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}
