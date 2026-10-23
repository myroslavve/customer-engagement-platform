import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbstractRepository } from '../database/abstract.repository';
import { Template } from '../database/entities/template.entity';

/** Read side of templates; the admin API owns writes. */
@Injectable()
export class TemplateRepository extends AbstractRepository<Template> {
  constructor(@InjectRepository(Template) templateRepository: Repository<Template>) {
    super(templateRepository);
  }
}
