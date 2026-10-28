import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { IsObject, IsString, Length } from 'class-validator';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRequest, requireAccountId } from './admin-request';
import { WorkflowService } from './workflow.service';
import { WorkflowDefinition } from './workflow.types';

class WorkflowDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsObject()
  definition!: WorkflowDefinition;
}

@Controller('admin/workflows')
@UseGuards(AdminAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.workflowService.list(requireAccountId(request));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: WorkflowDto) {
    return this.workflowService.create(requireAccountId(request), input);
  }

  @Post(':id/publish')
  publish(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.publish(requireAccountId(request), id);
  }

  @Post(':id/pause')
  pause(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.pause(requireAccountId(request), id);
  }

  @Post(':id/resume')
  resume(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.workflowService.resume(requireAccountId(request), id);
  }

  @Post('validate')
  validate(@Body() input: Pick<WorkflowDto, 'definition'>) {
    this.workflowService.validate(input.definition);
    return { valid: true };
  }
}
