import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Columns every table has; TypeORM sets createdAt on insert and bumps updatedAt on every update. */
export abstract class AbstractEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
