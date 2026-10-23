import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { EventOutbox } from '../database/entities/event-outbox.entity';
import { Transaction } from '../types/transaction.types';

@Injectable()
export class EventOutboxRepository extends AbstractRepository<EventOutbox> {
  constructor(@InjectRepository(EventOutbox) eventOutboxRepository: Repository<EventOutbox>) {
    super(eventOutboxRepository);
  }

  async add(eventId: string, transaction?: Transaction): Promise<void> {
    await this.getRepository(transaction)
      .createQueryBuilder()
      .insert()
      .into(EventOutbox)
      .values({ eventId })
      .orIgnore()
      .execute();
  }

  findPending(limit: number, transaction?: Transaction): Promise<EventOutbox[]> {
    return this.find({ order: { createdAt: 'ASC' }, take: limit }, transaction);
  }

  async removeByEventId(eventId: string, transaction?: Transaction): Promise<void> {
    await this.getRepository(transaction).delete({ eventId });
  }
}
