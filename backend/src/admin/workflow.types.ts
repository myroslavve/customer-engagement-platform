export enum WorkflowStatus {
  Draft = 'draft',
  Active = 'active',
  Paused = 'paused',
}

export type WorkflowNode = {
  id: string;
  type: 'branch' | 'delay' | 'wait_for_event' | 'send_email' | 'exit';
  next?: string | null;
  elseNext?: string | null;
  timeoutNext?: string | null;
  condition?: Record<string, unknown>;
  /** Only on wait_for_event: an additional condition the resuming event must satisfy. */
  filter?: Record<string, unknown>;
  durationMs?: number;
  timeoutMs?: number;
  eventName?: string;
  templateId?: string;
};

export type WorkflowDefinition = {
  trigger: {
    eventName: string;
    /** Saved audience; its rule is snapshotted into filter when the version is created. */
    audienceId?: string;
    filter?: Record<string, unknown>;
  };
  entryNodeId: string;
  nodes: WorkflowNode[];
};

export type WorkflowInput = {
  name: string;
  definition: WorkflowDefinition;
};
