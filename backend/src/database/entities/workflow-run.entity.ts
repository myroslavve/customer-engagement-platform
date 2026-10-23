import { Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { RunStatus } from '../../enums/run-status.enum';
import type { RunState } from '../../types/run-state.types';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';
import { Profile } from './profile.entity';
import { UserEvent } from './user-event.entity';
import { WorkflowVersion } from './workflow-version.entity';
import { Workflow } from './workflow.entity';

/** createdAt is when the run started. */
@Entity({ name: 'workflow_runs' })
@Unique('uq_workflow_runs_version_trigger_event', ['workflowVersionId', 'triggerEventId'])
@Index('ix_workflow_runs_profile_status', ['profileId', 'status'])
// At most one live run per (workflow, profile). `where` is written the way Postgres reports it,
// so migration:generate sees no drift.
@Index('uq_workflow_runs_live_per_profile', ['workflowId', 'profileId'], {
  unique: true,
  where: "(status = ANY (ARRAY['running'::workflow_run_status, 'waiting'::workflow_run_status]))",
})
export class WorkflowRun extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'fk_workflow_runs_account_id' })
  accountId: string;
  @Column('uuid')
  @ForeignKey(() => Workflow, { name: 'fk_workflow_runs_workflow_id' })
  workflowId: string;
  @Column('uuid')
  @ForeignKey(() => WorkflowVersion, { name: 'fk_workflow_runs_workflow_version_id' })
  workflowVersionId: string;
  @Column('uuid')
  @ForeignKey(() => Profile, { name: 'fk_workflow_runs_profile_id' })
  profileId: string;
  @Column('uuid')
  @ForeignKey(() => UserEvent, { name: 'fk_workflow_runs_trigger_event_id' })
  triggerEventId: string;
  @Column({ type: 'enum', enum: RunStatus, enumName: 'workflow_run_status' }) status: RunStatus;
  @Column({ type: 'text', nullable: true }) currentNodeId: string | null;
  @Column({ type: 'text', nullable: true }) waitingForEvent: string | null;
  @Column({ type: 'timestamptz', nullable: true }) waitUntil: Date | null;
  @Column({ type: 'text', nullable: true }) claimKey: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) context: RunState;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
}
