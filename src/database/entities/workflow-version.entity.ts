import { Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import type { WorkflowDefinition } from '../../types/workflow-definition.types';
import { AbstractEntity } from './abstract.entity';
import { Workflow } from './workflow.entity';

@Entity({ name: 'workflow_versions' })
@Unique('uq_workflow_versions_workflow_version', ['workflowId', 'version'])
@Index('ix_workflow_versions_trigger_event', ['triggerEventName'])
export class WorkflowVersion extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Workflow, { name: 'fk_workflow_versions_workflow_id' })
  workflowId: string;
  @Column('int') version: number;
  @Column('text') triggerEventName: string;
  @Column({ type: 'jsonb' }) definition: WorkflowDefinition;
}
