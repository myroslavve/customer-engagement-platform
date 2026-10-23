import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsString, Length } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRequest, requireAccountId } from './admin-request';
import { AudienceService } from './audience.service';
import { AudienceRule } from './audience.service';

class AudienceDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsObject()
  rule!: AudienceRule;
}

class AudiencePreviewDto {
  @IsObject()
  rule!: AudienceRule;
}

@Controller('admin/audiences')
@UseGuards(AdminAuthGuard)
export class AudienceController {
  constructor(private readonly audienceService: AudienceService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.audienceService.list(requireAccountId(request));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: AudienceDto) {
    return this.audienceService.create(requireAccountId(request), {
      name: input.name,
      rule: input.rule,
    });
  }

  @Post('preview')
  preview(@Req() request: AdminRequest, @Body() input: AudiencePreviewDto) {
    return this.audienceService.preview(requireAccountId(request), input.rule);
  }
}
