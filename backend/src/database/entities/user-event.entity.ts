import { Column, Entity, ForeignKey, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';
import { Profile } from './profile.entity';

/** createdAt is when the platform received the event; occurredAt is when it happened in the product. */
@Entity({ name: 'events' })
@Index('ix_events_profile_occurred', ['profileId', 'occurredAt'])
// `where` is written the way Postgres reports it, so migration:generate sees no drift.
@Index('uq_events_account_message', ['accountId', 'messageId'], {
  unique: true,
  where: '(message_id IS NOT NULL)',
})
export class UserEvent extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'fk_events_account_id' })
  accountId: string;
  @Column('uuid')
  @ForeignKey(() => Profile, { name: 'fk_events_profile_id' })
  profileId: string;
  @Column('text') name: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) properties: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) messageId: string | null;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
}
