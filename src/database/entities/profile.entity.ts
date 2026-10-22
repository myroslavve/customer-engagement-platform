import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ name: 'profiles' })
@Unique('uq_profiles_account_external', ['accountId', 'externalId'])
export class Profile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') accountId: string;
  @Column('text') externalId: string;
  @Column({ type: 'text', nullable: true }) email: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) traits: Record<string, unknown>;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}
