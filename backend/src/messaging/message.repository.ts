import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AbstractRepository } from '../database/abstract.repository';
import { Message } from '../database/entities/message.entity';
import { MessageStatus } from '../enums/message-status.enum';
import { CreateMessageInput } from '../types/create-message-input.types';
import { CreateMessageResult } from '../types/create-message-result.types';
import { Transaction } from '../types/transaction.types';

/** Every status change is conditional on the expected current status, so late duplicates cannot overwrite a final state. */
@Injectable()
export class MessageRepository extends AbstractRepository<Message> {
  constructor(@InjectRepository(Message) messageRepository: Repository<Message>) {
    super(messageRepository);
  }

  /** INSERT ... ON CONFLICT (run_id, node_id) DO NOTHING, then select; the FK on template_id may throw. */
  async createIfAbsent(
    input: CreateMessageInput,
    transaction?: Transaction,
  ): Promise<CreateMessageResult> {
    const insertResult = await this.getRepository(transaction)
      .createQueryBuilder()
      .insert()
      .into(Message)
      // QueryDeepPartialEntity cannot map the jsonb variables column; the shape is exact.
      .values(input as QueryDeepPartialEntity<Message>)
      .orIgnore()
      .returning('id')
      .execute();
    const message = await this.findOneOrFail(
      { where: { runId: input.runId, nodeId: input.nodeId } },
      transaction,
    );
    return { message, created: (insertResult.raw as unknown[]).length > 0 };
  }

  /** queued → sending, right before the provider call. False when another attempt got there first. */
  claimForSending(id: string, transaction?: Transaction): Promise<boolean> {
    return this.transition(
      id,
      [MessageStatus.Queued],
      { status: MessageStatus.Sending },
      transaction,
    );
  }

  /** sending → queued: the provider definitively rejected the email, a retry may send it. */
  async releaseSending(id: string, transaction?: Transaction): Promise<void> {
    await this.transition(
      id,
      [MessageStatus.Sending],
      { status: MessageStatus.Queued },
      transaction,
    );
  }

  async markSent(
    id: string,
    providerMessageId: string | null,
    subject: string,
    attempts: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.transition(
      id,
      [MessageStatus.Sending],
      { status: MessageStatus.Sent, providerMessageId, subject, attempts, sentAt: () => 'now()' },
      transaction,
    );
  }

  async markFailed(
    id: string,
    error: string,
    attempts: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.transition(
      id,
      [MessageStatus.Queued, MessageStatus.Sending],
      { status: MessageStatus.Failed, error, attempts },
      transaction,
    );
  }

  async markSkipped(
    id: string,
    reason: string,
    attempts: number,
    transaction?: Transaction,
  ): Promise<void> {
    await this.transition(
      id,
      [MessageStatus.Queued],
      { status: MessageStatus.Skipped, error: reason, attempts },
      transaction,
    );
  }

  findByRunId(runId: string, transaction?: Transaction): Promise<Message[]> {
    return this.find({ where: { runId }, order: { createdAt: 'ASC' } }, transaction);
  }

  private async transition(
    id: string,
    from: MessageStatus[],
    patch: QueryDeepPartialEntity<Message>,
    transaction?: Transaction,
  ): Promise<boolean> {
    const result = await this.getRepository(transaction)
      .createQueryBuilder()
      .update(Message)
      .set(patch)
      .where('id = :id AND status IN (:...from)', { id, from })
      .execute();
    return result.affected === 1;
  }
}
