import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { UserEvent } from '../database/entities/user-event.entity';

@Injectable()
export class EventRepository extends AbstractRepository<UserEvent> {
  constructor(@InjectRepository(UserEvent) userEventRepository: Repository<UserEvent>) {
    super(userEventRepository);
  }
}
