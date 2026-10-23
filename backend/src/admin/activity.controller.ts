import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRequest, requireAccountId } from './admin-request';
import { ActivityItemType, ActivityService } from './activity.service';

class ActivityQueryDto {
  @IsOptional()
  @IsIn(['event', 'run', 'message'])
  type?: ActivityItemType;

  @IsOptional()
  @IsString()
  @IsUUID()
  profileId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  workflowId?: string;

  /** Run or message status, e.g. failed, waiting, sent. */
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
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
  userTimeline(
    @Req() request: AdminRequest,
    @Param('userId') userId: string,
    @Query() filter: ActivityQueryDto,
  ) {
    return this.activityService.userTimeline(requireAccountId(request), userId, filter.limit);
  }
}
