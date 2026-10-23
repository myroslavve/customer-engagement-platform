import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../database/entities/message.entity';
import { Template } from '../database/entities/template.entity';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EMAIL_PROVIDER } from './email-provider';
import { EmailSendProcessor } from './email-send.processor';
import { EmailService } from './email.service';
import { MessageRepository } from './message.repository';
import { ResendEmailProvider } from './resend-email.provider';
import { SendEmailStepExecutor } from './send-email-step.executor';
import { TemplateRenderer } from './template-renderer';
import { TemplateRepository } from './template.repository';

/** EMAIL_PROVIDER is a token so tests can swap Resend for a fake. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Template, Message]),
    QueuesModule,
    WorkflowsModule,
    WorkflowExecutionModule,
  ],
  providers: [
    { provide: EMAIL_PROVIDER, useClass: ResendEmailProvider },
    TemplateRepository,
    MessageRepository,
    TemplateRenderer,
    SendEmailStepExecutor,
    EmailService,
    EmailSendProcessor,
  ],
  exports: [EMAIL_PROVIDER, MessageRepository, TemplateRepository],
})
export class MessagingModule {}
