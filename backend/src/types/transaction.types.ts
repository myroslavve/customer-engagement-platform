import { EntityManager } from 'typeorm';

/** An open database transaction; pass it to repository methods to run them inside it. */
export type Transaction = EntityManager;
