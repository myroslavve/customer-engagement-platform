import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../database/entities/profile.entity';

@Injectable()
export class ProfileRepository {
  constructor(@InjectRepository(Profile) private readonly profiles: Repository<Profile>) {}

  findById(profileId: string): Promise<Profile | null> {
    return this.profiles.findOne({ where: { id: profileId } });
  }
}
