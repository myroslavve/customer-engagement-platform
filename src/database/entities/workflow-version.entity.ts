import { Column, Entity, Index, Unique } from 'typeorm';
import type { WorkflowDefinition } from '../../workflows/definition';
import { AbstractEntity } from './abstract.entity';

@Entity({ name: 'workflow_versions' })
@Unique('uq_workflow_versions_workflow_version', ['workflowId', 'version'])
@Index('ix_workflow_versions_trigger_event', ['triggerEventName'])
export class WorkflowVersion extends AbstractEntity {
  @Column('uuid') workflowId: string;
  @Column('int') version: number;
  @Column('text') triggerEventName: string;
  @Column({ type: 'jsonb' }) definition: WorkflowDefinition;
}
