import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEvent } from '../database/entities/user-event.entity';

@Injectable()
export class EventRepository {
  constructor(@InjectRepository(UserEvent) private readonly events: Repository<UserEvent>) {}

  findById(eventId: string): Promise<UserEvent | null> {
    return this.events.findOne({ where: { id: eventId } });
  }
}
