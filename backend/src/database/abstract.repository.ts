import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { Transaction } from '../types/transaction.types';
import { AbstractEntity } from './entities/abstract.entity';

/**
 * Base for domain repositories. Read/write methods accept the usual TypeORM find options plus an
 * optional transaction; without one they run on the default connection. Subclasses build their
 * queries on getRepository(transaction) so they get the same behaviour.
 */
export abstract class AbstractRepository<T extends AbstractEntity> {
  protected constructor(private readonly repository: Repository<T>) {}

  /** Runs work in one transaction: commits when it resolves, rolls back when it throws. */
  transaction<R>(work: (transaction: Transaction) => Promise<R>): Promise<R> {
    return this.repository.manager.transaction(work);
  }

  find(options?: FindManyOptions<T>, transaction?: Transaction): Promise<T[]> {
    return this.getRepository(transaction).find(options);
  }

  findOne(options: FindOneOptions<T>, transaction?: Transaction): Promise<T | null> {
    return this.getRepository(transaction).findOne(options);
  }

  /** Throws TypeORM's EntityNotFoundError when nothing matches. */
  findOneOrFail(options: FindOneOptions<T>, transaction?: Transaction): Promise<T> {
    return this.getRepository(transaction).findOneOrFail(options);
  }

  findById(id: string, transaction?: Transaction): Promise<T | null> {
    return this.findOne({ where: { id } as FindOptionsWhere<T> }, transaction);
  }

  findByIdOrFail(id: string, transaction?: Transaction): Promise<T> {
    return this.findOneOrFail({ where: { id } as FindOptionsWhere<T> }, transaction);
  }

  save(entity: DeepPartial<T>, transaction?: Transaction): Promise<T> {
    return this.getRepository(transaction).save(entity);
  }

  protected getRepository(transaction?: Transaction): Repository<T> {
    return transaction ? transaction.getRepository(this.repository.target) : this.repository;
  }
}
