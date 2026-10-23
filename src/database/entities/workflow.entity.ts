import { Column, Entity } from 'typeorm';
import { WorkflowStatus } from '../../enums/workflow-status.enum';
import { AbstractEntity } from './abstract.entity';

@Entity({ name: 'workflows' })
export class Workflow extends AbstractEntity {
  @Column('uuid') accountId: string;
  @Column('text') name: string;
  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    enumName: 'workflow_status',
    default: WorkflowStatus.Draft,
  })
  status: WorkflowStatus;
  @Column({ type: 'uuid', nullable: true }) publishedVersionId: string | null;
}
