import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow, WorkflowStatus, WorkflowVersion } from '../database/entities';

@Injectable()
export class WorkflowRepository {
  constructor(
    @InjectRepository(WorkflowVersion) private readonly versions: Repository<WorkflowVersion>,
  ) {}

  /** Published versions of active workflows in the account whose trigger matches eventName. */
  findActiveByTrigger(accountId: string, eventName: string): Promise<WorkflowVersion[]> {
    return this.versions
      .createQueryBuilder('version')
      .innerJoin(Workflow, 'workflow', 'workflow.publishedVersionId = version.id')
      .where('workflow.accountId = :accountId', { accountId })
      .andWhere('workflow.status = :status', { status: WorkflowStatus.Active })
      .andWhere('version.triggerEventName = :eventName', { eventName })
      .getMany();
  }

  async getVersion(versionId: string): Promise<WorkflowVersion> {
    const version = await this.versions.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException(`Workflow version ${versionId} not found`);
    return version;
  }
}
