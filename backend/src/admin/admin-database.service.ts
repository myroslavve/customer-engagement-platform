import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

@Injectable()
export class AdminDatabaseService {
  constructor(private readonly dataSource: DataSource) {}

  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    return this.dataSource.query(text, values).then((rows: T[]) => ({ rows }));
  }

  async transaction<T>(callback: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    let transactionStarted = false;
    try {
      await queryRunner.startTransaction();
      transactionStarted = true;
      const result = await callback(queryRunner);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (transactionStarted) await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
