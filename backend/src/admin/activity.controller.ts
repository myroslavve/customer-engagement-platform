import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRequest, requireAccountId } from './admin-request';
import { ActivityService } from './activity.service';

class ActivityQueryDto {
  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit = 100;
}

@Controller('admin/activity')
@UseGuards(AdminAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  list(@Req() request: AdminRequest, @Query() filter: ActivityQueryDto) {
    return this.activityService.list(requireAccountId(request), filter);
  }

  @Get('users/:userId')
  userTimeline(@Req() request: AdminRequest, @Param('userId') userId: string) {
    return this.activityService.userTimeline(requireAccountId(request), userId);
  }
}
