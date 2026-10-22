import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  EmailSendJob,
  JOB_EXECUTE_STEP,
  JOB_PROCESS_EVENT,
  JOB_SEND_EMAIL,
  ProcessEventJob,
  StepJob,
  emailSendJobId,
  processEventJobId,
  stepJobId,
} from './jobs';
import { QUEUE_EMAIL_SEND, QUEUE_EVENTS, QUEUE_WORKFLOW_STEPS } from './queue-names';

@Injectable()
export class QueueProducer {
  constructor(
    @InjectQueue(QUEUE_EVENTS) private readonly eventsQueue: Queue<ProcessEventJob>,
    @InjectQueue(QUEUE_WORKFLOW_STEPS) private readonly stepsQueue: Queue<StepJob>,
    @InjectQueue(QUEUE_EMAIL_SEND) private readonly emailQueue: Queue<EmailSendJob>,
  ) {}

  async enqueueProcessEvent(job: ProcessEventJob): Promise<void> {
    await this.eventsQueue.add(JOB_PROCESS_EVENT, job, { jobId: processEventJobId(job) });
  }

  async enqueueStep(job: StepJob, delayMs?: number): Promise<void> {
    await this.stepsQueue.add(JOB_EXECUTE_STEP, job, { jobId: stepJobId(job), delay: delayMs });
  }

  async enqueueEmail(job: EmailSendJob): Promise<void> {
    await this.emailQueue.add(JOB_SEND_EMAIL, job, { jobId: emailSendJobId(job) });
  }
}
