import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { Profile } from '../database/entities/profile.entity';

@Injectable()
export class ProfileRepository extends AbstractRepository<Profile> {
  constructor(@InjectRepository(Profile) profileRepository: Repository<Profile>) {
    super(profileRepository);
  }
}
