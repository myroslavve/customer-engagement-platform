import { Column, Entity, ForeignKey, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';
import { Account } from './account.entity';

@Entity({ name: 'profiles' })
@Unique('uq_profiles_account_external', ['accountId', 'externalId'])
export class Profile extends AbstractEntity {
  @Column('uuid')
  @ForeignKey(() => Account, { name: 'fk_profiles_account_id' })
  accountId: string;
  @Column('text') externalId: string;
  @Column({ type: 'text', nullable: true }) email: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) traits: Record<string, unknown>;
}
