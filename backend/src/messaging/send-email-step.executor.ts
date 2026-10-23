import { Injectable } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { Message } from '../database/entities/message.entity';
import { isForeignKeyViolation } from '../database/is-foreign-key-violation';
import { NodeType } from '../enums/node-type.enum';
import { StepResultKind } from '../enums/step-result-kind.enum';
import { QueueProducer } from '../queues/queue-producer';
import { StepExecutionContext } from '../types/step-execution-context.types';
import { StepResult } from '../types/step-result.types';
import { SendEmailNode } from '../types/workflow-definition.types';
import { StepExecutor } from '../workflow-execution/step-executor';
import { StepExecutorRegistry } from '../workflow-execution/step-executor.registry';
import { MessageRepository } from './message.repository';

/** Records the message (idempotent per run and node) and queues the send; the run moves on at once. */
@Injectable()
export class SendEmailStepExecutor implements StepExecutor<SendEmailNode> {
  readonly nodeType = NodeType.SendEmail;

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly queueProducer: QueueProducer,
    stepExecutorRegistry: StepExecutorRegistry,
  ) {
    stepExecutorRegistry.register(this);
  }

  async execute(node: SendEmailNode, ctx: StepExecutionContext): Promise<StepResult> {
    const message = await this.createMessage(node, ctx);
    await this.queueProducer.enqueueEmail({ messageId: message.id });
    return { kind: StepResultKind.Advance, nextNodeId: node.next };
  }

  /** A retried step finds the row it inserted before. An unknown template fails the run at once. */
  private async createMessage(node: SendEmailNode, ctx: StepExecutionContext): Promise<Message> {
    const { run, runContext } = ctx;
    try {
      const result = await this.messageRepository.createIfAbsent({
        accountId: run.accountId,
        runId: run.id,
        nodeId: node.id,
        profileId: run.profileId,
        templateId: node.templateId,
        toEmail: runContext.profile.email,
        variables: runContext,
      });
      return result.message;
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error;
      throw new UnrecoverableError(
        `Template "${node.templateId}" of node "${node.id}" does not exist`,
      );
    }
  }
}
