import { Column, Entity, ForeignKey } from 'typeorm';
import { WorkflowStatus } from '../../enums/workflow-status.enum';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';
import { WorkflowVersion } from './workflow-version.entity';

@Entity({ name: 'workflows' })
export class Workflow extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'fk_workflows_account_id' })
  accountId: string;
  @Column('text') name: string;
  // varchar, not a PG enum: a new status must not need ALTER TYPE.
  @Column({ type: 'varchar', default: WorkflowStatus.Draft }) status: WorkflowStatus;
  @Column({ type: 'uuid', nullable: true })
  @ForeignKey(() => WorkflowVersion, { name: 'fk_workflows_published_version_id' })
  publishedVersionId: string | null;
}
