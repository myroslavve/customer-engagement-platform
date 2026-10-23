import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AbstractRepository } from '../database/abstract.repository';
import { UserEvent } from '../database/entities/user-event.entity';
import { CreateEventInput } from '../types/create-event-input.types';
import { Transaction } from '../types/transaction.types';

@Injectable()
export class EventRepository extends AbstractRepository<UserEvent> {
  constructor(@InjectRepository(UserEvent) userEventRepository: Repository<UserEvent>) {
    super(userEventRepository);
  }

  findByMessageId(
    accountId: string,
    messageId: string,
    transaction?: Transaction,
  ): Promise<UserEvent | null> {
    return this.findOne({ where: { accountId, messageId } }, transaction);
  }

  /**
   * INSERT ... ON CONFLICT DO NOTHING RETURNING id. Returns the new event id, or null when an event
   * with this (accountId, messageId) already exists.
   */
  async createIfAbsent(input: CreateEventInput, transaction?: Transaction): Promise<string | null> {
    const insertResult = await this.getRepository(transaction)
      .createQueryBuilder()
      .insert()
      .into(UserEvent)
      // QueryDeepPartialEntity cannot map Record<string, unknown> jsonb columns; the shape is exact.
      .values(input as QueryDeepPartialEntity<UserEvent>)
      .orIgnore()
      .returning('id')
      .execute();
    const rows = insertResult.raw as { id: string }[];
    return rows[0]?.id ?? null;
  }
}
