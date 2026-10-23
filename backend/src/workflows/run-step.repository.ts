import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AbstractRepository } from '../database/abstract.repository';
import { RunStep } from '../database/entities/run-step.entity';
import { CreateRunStepInput } from '../types/create-run-step-input.types';
import { Transaction } from '../types/transaction.types';

@Injectable()
export class RunStepRepository extends AbstractRepository<RunStep> {
  constructor(@InjectRepository(RunStep) runStepRepository: Repository<RunStep>) {
    super(runStepRepository);
  }

  create(input: CreateRunStepInput, transaction?: Transaction): Promise<RunStep> {
    return this.save(input, transaction);
  }

  /** INSERT ... ON CONFLICT (job_id) DO NOTHING: a failed step may be recorded by a duplicate job. */
  async createIfAbsent(input: CreateRunStepInput, transaction?: Transaction): Promise<void> {
    await this.getRepository(transaction)
      .createQueryBuilder()
      .insert()
      .into(RunStep)
      // QueryDeepPartialEntity cannot map the jsonb output column; the shape is exact.
      .values(input as QueryDeepPartialEntity<RunStep>)
      .orIgnore()
      .execute();
  }

  /** True when error is the uq_run_steps_job_id violation: another job recorded this step first. */
  isJobIdConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string; constraint?: string };
    return driverError.code === '23505' && driverError.constraint === 'uq_run_steps_job_id';
  }

  findByJobId(jobId: string, transaction?: Transaction): Promise<RunStep | null> {
    return this.findOne({ where: { jobId } }, transaction);
  }

  findByRunId(runId: string, transaction?: Transaction): Promise<RunStep[]> {
    return this.find({ where: { runId }, order: { createdAt: 'ASC' } }, transaction);
  }
}
