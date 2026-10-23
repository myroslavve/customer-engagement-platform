import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { Message } from '../database/entities/message.entity';
import { Template } from '../database/entities/template.entity';
import { EmailProviderKind } from '../enums/email-provider-kind.enum';
import { QueuesModule } from '../queues/queues.module';
import { WorkflowExecutionModule } from '../workflow-execution/workflow-execution.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EMAIL_PROVIDER, EmailProvider } from './email-provider';
import { EmailSendProcessor } from './email-send.processor';
import { EmailService } from './email.service';
import { LogEmailProvider } from './log-email.provider';
import { MessageRepository } from './message.repository';
import { ResendEmailProvider } from './resend-email.provider';
import { SendEmailStepExecutor } from './send-email-step.executor';
import { TemplateRenderer } from './template-renderer';
import { TemplateRepository } from './template.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, Message]),
    QueuesModule,
    WorkflowsModule,
    WorkflowExecutionModule,
  ],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>): EmailProvider => {
        const { provider, resendApiKey, fromAddress } = configService.get('email', { infer: true });
        if (provider !== EmailProviderKind.Resend) return new LogEmailProvider();
        if (!resendApiKey) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
        return new ResendEmailProvider(resendApiKey, fromAddress);
      },
    },
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
