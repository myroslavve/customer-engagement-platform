import { Column, Entity, ForeignKey, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';

/**
 * Email template; subject and body may contain {{path}} placeholders into the RunContext. The table
 * is created by the AdminApi migration; constraint names match what Postgres gave them there.
 */
@Entity({ name: 'templates' })
@Unique('uq_templates_account_name', ['accountId', 'name'])
export class Template extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'templates_account_id_fkey', onDelete: 'CASCADE' })
  accountId: string;
  @Column('text') name: string;
  @Column('text') subject: string;
  /** HTML. */
  @Column('text') body: string;
}
