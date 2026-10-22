import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'events' })
@Index('ix_events_profile_occurred', ['profileId', 'occurredAt'])
export class UserEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') accountId: string;
  @Column('uuid') profileId: string;
  @Column('text') name: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) properties: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) messageId: string | null;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) receivedAt: Date;
}
