import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { AudienceController } from './audience.controller';
import { AudienceService } from './audience.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TemplateController, AudienceController, WorkflowController, ActivityController],
  providers: [TemplateService, AudienceService, WorkflowService, ActivityService],
  exports: [TemplateService, WorkflowService],
})
export class AdminModule {}
