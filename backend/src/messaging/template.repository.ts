import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { Template } from '../database/entities/template.entity';
import { Transaction } from '../types/transaction.types';

/** Any value Postgres accepts as uuid (class-validator's isUUID also demands an RFC version digit). */
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read side of templates; the admin API owns writes. */
@Injectable()
export class TemplateRepository extends AbstractRepository<Template> {
  constructor(@InjectRepository(Template) templateRepository: Repository<Template>) {
    super(templateRepository);
  }

  /**
   * The account's template, or null. Workflow definitions accept any string as templateId, so a
   * non-uuid id is "not found" rather than a Postgres cast error that would be retried forever.
   */
  async findForAccount(
    id: string,
    accountId: string,
    transaction?: Transaction,
  ): Promise<Template | null> {
    if (!UUID_FORMAT.test(id)) return null;
    return this.findOne({ where: { id, accountId } }, transaction);
  }
}
