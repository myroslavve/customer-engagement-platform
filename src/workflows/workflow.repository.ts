import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { WorkflowVersion } from '../database/entities/workflow-version.entity';
import { Workflow } from '../database/entities/workflow.entity';
import { WorkflowStatus } from '../enums/workflow-status.enum';
import { Transaction } from '../types/transaction.types';

/** Reads workflow versions, the unit the engine executes. */
@Injectable()
export class WorkflowRepository extends AbstractRepository<WorkflowVersion> {
  constructor(
    @InjectRepository(WorkflowVersion) workflowVersionRepository: Repository<WorkflowVersion>,
  ) {
    super(workflowVersionRepository);
  }

  /** Published versions of active workflows in the account whose trigger matches eventName. */
  findActiveByTrigger(
    accountId: string,
    eventName: string,
    transaction?: Transaction,
  ): Promise<WorkflowVersion[]> {
    return this.getRepository(transaction)
      .createQueryBuilder('version')
      .innerJoin(Workflow, 'workflow', 'workflow.publishedVersionId = version.id')
      .where('workflow.accountId = :accountId', { accountId })
      .andWhere('workflow.status = :status', { status: WorkflowStatus.Active })
      .andWhere('version.triggerEventName = :eventName', { eventName })
      .getMany();
  }

  getVersion(versionId: string, transaction?: Transaction): Promise<WorkflowVersion> {
    return this.findByIdOrFail(versionId, transaction);
  }

  /** Loads several versions in one query, keyed by id; throws if any of them is missing. */
  async getVersions(
    versionIds: string[],
    transaction?: Transaction,
  ): Promise<Map<string, WorkflowVersion>> {
    const uniqueIds = [...new Set(versionIds)];
    if (uniqueIds.length === 0) return new Map();
    const versions = await this.find({ where: { id: In(uniqueIds) } }, transaction);
    const byId = new Map(versions.map((version) => [version.id, version]));
    const missing = uniqueIds.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new Error(`Workflow versions not found: ${missing.join(', ')}`);
    return byId;
  }
}
