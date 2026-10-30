import { ComparisonOp } from '../enums/comparison-op.enum';
import { NodeType } from '../enums/node-type.enum';
import { DevScenario } from '../types/dev-scenario.types';
import { WorkflowNode } from '../types/workflow-definition.types';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
/** A template id no account has: the send_email step fails the run. */
const UNKNOWN_TEMPLATE_ID = '00000000-0000-0000-0000-00000000dead';

const EXIT: WorkflowNode = { id: 'done', type: NodeType.Exit };
const isPro = { field: 'profile.traits.plan', op: ComparisonOp.Eq, value: 'pro' };
const paidPurchase = { field: 'event.properties.amount', op: ComparisonOp.Gt, value: 0 };

/** Every node type and outcome the engine has today, one workflow each, plus all of them together. */
export const DEV_SCENARIOS: DevScenario[] = [
  {
    name: 'send-email',
    description: 'send_email → exit: renders the template and sends it.',
    hint: '"email": null → message skipped (no_email); "unsubscribed": true → skipped (unsubscribed).',
    definition: (templateId) => ({
      entryNodeId: 'send',
      nodes: [{ id: 'send', type: NodeType.SendEmail, templateId, next: 'done' }, EXIT],
    }),
  },
  {
    name: 'branch',
    description: 'branch on profile.traits.plan == "pro": send_email, else exit.',
    hint: '"traits": {"plan": "pro"} sends the email; any other plan exits without one.',
    definition: (templateId) => ({
      entryNodeId: 'plan',
      nodes: [
        { id: 'plan', type: NodeType.Branch, condition: isPro, next: 'send', elseNext: 'done' },
        { id: 'send', type: NodeType.SendEmail, templateId, next: 'done' },
        EXIT,
      ],
    }),
  },
  {
    name: 'delay',
    description: 'delay 1 h → send_email → exit.',
    hint: 'POST /dev/runs/:id/fast-forward ends the delay now.',
    definition: (templateId) => ({
      entryNodeId: 'delay',
      nodes: [
        { id: 'delay', type: NodeType.Delay, durationMs: ONE_HOUR_MS, next: 'send' },
        { id: 'send', type: NodeType.SendEmail, templateId, next: 'done' },
        EXIT,
      ],
    }),
  },
  {
    name: 'wait-for-event',
    description: 'wait 1 day for purchase (amount > 0): exit; on timeout send_email → exit.',
    hint:
      'POST /dev/runs/:id/events {"eventName": "purchase", "properties": {"amount": 10}} takes the ' +
      'event path (amount 0 is ignored by the filter); POST /dev/runs/:id/fast-forward fires the timeout.',
    definition: (templateId) => ({
      entryNodeId: 'wait',
      nodes: [
        {
          id: 'wait',
          type: NodeType.WaitForEvent,
          eventName: 'purchase',
          filter: paidPurchase,
          timeoutMs: ONE_DAY_MS,
          next: 'done',
          timeoutNext: 'send',
        },
        { id: 'send', type: NodeType.SendEmail, templateId, next: 'done' },
        EXIT,
      ],
    }),
  },
  {
    name: 'missing-template',
    description: 'send_email with a template that does not exist: the run fails at once.',
    hint: 'Expect run status failed and a failed step with the error.',
    definition: () => ({
      entryNodeId: 'send',
      nodes: [
        { id: 'send', type: NodeType.SendEmail, templateId: UNKNOWN_TEMPLATE_ID, next: null },
      ],
    }),
  },
  {
    name: 'everything',
    description:
      'delay 1 h → branch plan == "pro" → (pro) wait 1 day for purchase: exit, timeout: send_email; ' +
      '(else) send_email.',
    hint:
      'fast-forward ends the delay; then, for "traits": {"plan": "pro"}, send a purchase or ' +
      'fast-forward again for the timeout.',
    definition: (templateId) => ({
      entryNodeId: 'delay',
      nodes: [
        { id: 'delay', type: NodeType.Delay, durationMs: ONE_HOUR_MS, next: 'plan' },
        { id: 'plan', type: NodeType.Branch, condition: isPro, next: 'wait', elseNext: 'send' },
        {
          id: 'wait',
          type: NodeType.WaitForEvent,
          eventName: 'purchase',
          filter: paidPurchase,
          timeoutMs: ONE_DAY_MS,
          next: 'done',
          timeoutNext: 'send',
        },
        { id: 'send', type: NodeType.SendEmail, templateId, next: 'done' },
        EXIT,
      ],
    }),
  },
];

/** Trigger event of a scenario's workflow, so no other workflow of the account reacts to it. */
export function scenarioEventName(name: string): string {
  return `dev.${name}`;
}
