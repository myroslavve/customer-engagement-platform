import { ComparisonOp } from '../enums/comparison-op.enum';
import { NodeType } from '../enums/node-type.enum';
import { WorkflowDefinition } from '../types/workflow-definition.types';

/** Names the bootstrap looks the samples up by, so a second bootstrap reuses them. */
export const SAMPLE_TEMPLATE_NAME = 'dev-reminder';
export const SAMPLE_WORKFLOW_NAME = 'dev-abandoned-view';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const SAMPLE_TEMPLATE = {
  name: SAMPLE_TEMPLATE_NAME,
  subject: 'Still thinking about {{event.properties.product_title}}?',
  body: '<p>Hi {{profile.traits.name}}, {{event.properties.product_title}} is still waiting for you.</p>',
};

/**
 * The example from the project description: a viewed item, a day to buy it, a reminder otherwise.
 * POST /dev/runs/:id/fast-forward skips the day.
 */
export function sampleWorkflowDefinition(templateId: string): WorkflowDefinition {
  return {
    trigger: { eventName: 'item_viewed' },
    entryNodeId: 'wait_purchase',
    nodes: [
      {
        id: 'wait_purchase',
        type: NodeType.WaitForEvent,
        eventName: 'purchase',
        filter: { field: 'event.properties.amount', op: ComparisonOp.Gt, value: 0 },
        timeoutMs: ONE_DAY_MS,
        next: 'done',
        timeoutNext: 'send_reminder',
      },
      { id: 'send_reminder', type: NodeType.SendEmail, templateId, next: 'done' },
      { id: 'done', type: NodeType.Exit },
    ],
  };
}
