import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { requireAccountId, AdminRequest } from './admin-request';
import { TemplateService } from './template.service';

class TemplateDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsString()
  @Length(1, 500)
  subject!: string;

  @IsString()
  @Length(1, 100_000)
  body!: string;
}

@Controller('admin/templates')
@UseGuards(AdminAuthGuard)
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.templateService.list(requireAccountId(request));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: TemplateDto) {
    return this.templateService.create(requireAccountId(request), input);
  }

  @Patch(':id')
  update(@Req() request: AdminRequest, @Param('id') id: string, @Body() input: TemplateDto) {
    return this.templateService.update(requireAccountId(request), id, input);
  }

  @Delete(':id')
  delete(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.templateService.delete(requireAccountId(request), id);
  }
}
