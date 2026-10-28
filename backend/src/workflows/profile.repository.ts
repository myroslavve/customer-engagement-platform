import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { Profile } from '../database/entities/profile.entity';
import { Transaction } from '../types/transaction.types';
import { UpsertProfileInput } from '../types/upsert-profile-input.types';

@Injectable()
export class ProfileRepository extends AbstractRepository<Profile> {
  constructor(@InjectRepository(Profile) profileRepository: Repository<Profile>) {
    super(profileRepository);
  }

  findByExternalId(
    accountId: string,
    externalId: string,
    transaction?: Transaction,
  ): Promise<Profile | null> {
    return this.findOne({ where: { accountId, externalId } }, transaction);
  }

  async markUnsubscribed(id: string, transaction?: Transaction): Promise<void> {
    await this.getRepository(transaction).update(id, { unsubscribedAt: new Date() });
  }

  /**
   * Creates the profile or updates it in place: a null email keeps the stored one, traits are merged.
   * Raw SQL because the query builder cannot express the COALESCE / jsonb merge update. Returns its id.
   */
  async upsert(input: UpsertProfileInput, transaction?: Transaction): Promise<string> {
    const rows: { id: string }[] = await this.getRepository(transaction).query(
      `INSERT INTO profiles (account_id, external_id, email, traits)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, external_id) DO UPDATE
         SET email = COALESCE(EXCLUDED.email, profiles.email),
             traits = profiles.traits || EXCLUDED.traits,
             updated_at = now()
       RETURNING id`,
      [input.accountId, input.externalId, input.email, JSON.stringify(input.traits)],
    );
    return rows[0].id;
  }
}
