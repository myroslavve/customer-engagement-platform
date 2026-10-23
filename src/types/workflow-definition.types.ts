import { ComparisonOp } from '../enums/comparison-op.enum';
import { NodeType } from '../enums/node-type.enum';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: ComparisonOp; value?: unknown };

interface BaseNode {
  /** Matches /^[A-Za-z0-9_-]+$/; used inside BullMQ job ids. */
  id: string;
}

export interface BranchNode extends BaseNode {
  type: NodeType.Branch;
  condition: Condition;
  next: string | null;
  elseNext: string | null;
}

export interface DelayNode extends BaseNode {
  type: NodeType.Delay;
  durationMs: number;
  next: string | null;
}

export interface WaitForEventNode extends BaseNode {
  type: NodeType.WaitForEvent;
  eventName: string;
  filter?: Condition;
  timeoutMs: number;
  next: string | null;
  timeoutNext: string | null;
}

export interface SendEmailNode extends BaseNode {
  type: NodeType.SendEmail;
  templateId: string;
  next: string | null;
}

export interface ExitNode extends BaseNode {
  type: NodeType.Exit;
}

export type WorkflowNode = BranchNode | DelayNode | WaitForEventNode | SendEmailNode | ExitNode;

export interface WorkflowTrigger {
  eventName: string;
  filter?: Condition;
}

/** Stored as jsonb in workflow_versions.definition. Graphs are acyclic (validated by the admin API). */
export interface WorkflowDefinition {
  trigger: WorkflowTrigger;
  entryNodeId: string;
  nodes: WorkflowNode[];
}
