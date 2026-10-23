import { Column, Entity } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

@Entity({ name: 'accounts' })
export class Account extends AbstractEntity {
  @Column('text') name: string;
}
