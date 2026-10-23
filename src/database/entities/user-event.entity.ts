import { Column, Entity, Index } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

/** createdAt is when the platform received the event; occurredAt is when it happened in the product. */
@Entity({ name: 'events' })
@Index('ix_events_profile_occurred', ['profileId', 'occurredAt'])
export class UserEvent extends AbstractEntity {
  @Column('uuid') accountId: string;
  @Column('uuid') profileId: string;
  @Column('text') name: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) properties: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) messageId: string | null;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
}
