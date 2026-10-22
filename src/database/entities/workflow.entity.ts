import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum WorkflowStatus {
  Draft = 'draft',
  Active = 'active',
  Paused = 'paused',
}

@Entity({ name: 'workflows' })
export class Workflow {
  @PrimaryGeneratedColumn('uuid') id: string;
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
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}
