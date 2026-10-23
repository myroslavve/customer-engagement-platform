import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository, Transaction } from '../database/abstract.repository';
import { WorkflowVersion } from '../database/entities/workflow-version.entity';
import { Workflow, WorkflowStatus } from '../database/entities/workflow.entity';

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
}
