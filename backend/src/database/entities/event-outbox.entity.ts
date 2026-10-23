import { Column, Entity, ForeignKey, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { UserEvent } from './user-event.entity';

/**
 * Events whose process-event job may not have reached the queue yet. Written in the same transaction
 * as the event; the outbox publisher re-adds the job (deduplicated by jobId) and deletes the row.
 */
@Entity({ name: 'event_outbox' })
@Unique('uq_event_outbox_event', ['eventId'])
export class EventOutbox extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => UserEvent, { name: 'fk_event_outbox_event_id', onDelete: 'CASCADE' })
  eventId: string;
}
