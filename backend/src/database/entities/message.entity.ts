import { Column, Entity, ForeignKey, Index, Unique } from 'typeorm';
import { MessageStatus } from '../../enums/message-status.enum';
import type { RunContext } from '../../types/run-context.types';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';
import { Profile } from './profile.entity';
import { Template } from './template.entity';
import { WorkflowRun } from './workflow-run.entity';

/** One email per (run, node): the message log. The row is the idempotency anchor of the send-email job. */
@Entity({ name: 'messages' })
@Unique('uq_messages_run_node', ['runId', 'nodeId'])
@Index('ix_messages_account_created', ['accountId', 'createdAt'])
@Index('ix_messages_profile_created', ['profileId', 'createdAt'])
export class Message extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'fk_messages_account_id' })
  accountId: string;
  @Column('uuid')
  @ForeignKey(() => WorkflowRun, { name: 'fk_messages_run_id' })
  runId: string;
  @Column('text') nodeId: string;
  @Column('uuid')
  @ForeignKey(() => Profile, { name: 'fk_messages_profile_id' })
  profileId: string;
  // Nullable: the admin API hard-deletes templates; a queued message then fails as template_not_found.
  @Column({ type: 'uuid', nullable: true })
  @ForeignKey(() => Template, { name: 'fk_messages_template_id', onDelete: 'SET NULL' })
  templateId: string | null;
  @Column({ type: 'text', nullable: true }) toEmail: string | null;
  @Column({ type: 'text', nullable: true }) subject: string | null;
  @Column({ type: 'jsonb' }) variables: RunContext;
  // varchar, not a PG enum: a new status must not need ALTER TYPE.
  @Column({ type: 'varchar', default: MessageStatus.Queued }) status: MessageStatus;
  @Column({ type: 'text', nullable: true }) providerMessageId: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
}
