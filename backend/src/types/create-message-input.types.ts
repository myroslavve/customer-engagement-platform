import { RunContext } from './run-context.types';

export type CreateMessageInput = {
  accountId: string;
  runId: string;
  nodeId: string;
  profileId: string;
  templateId: string;
  toEmail: string | null;
  /** Snapshot the template is rendered with. */
  variables: RunContext;
};
