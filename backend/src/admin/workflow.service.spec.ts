import { BadRequestException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

describe('WorkflowService', () => {
  const service = new WorkflowService({} as never);

  it('accepts an acyclic worker-compatible definition', () => {
    expect(
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'send',
        nodes: [{ id: 'send', type: 'send_email', templateId: 'welcome', next: null }]
      })
    ).toBe(true);
  });

  it('rejects cycles and unresolved node targets', () => {
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'branch', next: 'b', elseNext: null },
          { id: 'b', type: 'delay', next: 'a' }
        ]
      })
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'delay', next: 'missing' }]
      })
    ).toThrow(BadRequestException);
  });
});
