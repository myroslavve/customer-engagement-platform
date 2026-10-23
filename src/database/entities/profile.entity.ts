import { Column, Entity, Unique } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

@Entity({ name: 'profiles' })
@Unique('uq_profiles_account_external', ['accountId', 'externalId'])
export class Profile extends AbstractEntity {
  @Column('uuid') accountId: string;
  @Column('text') externalId: string;
  @Column({ type: 'text', nullable: true }) email: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) traits: Record<string, unknown>;
}
