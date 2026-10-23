import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowService } from './workflow.service';
import { WorkflowDefinition } from './workflow.types';

const targetedDefinition: WorkflowDefinition = {
  trigger: {
    eventName: 'signed_up',
    audienceId: 'audience-1',
    filter: { field: 'profile.email', op: 'exists' },
  },
  entryNodeId: 'send',
  nodes: [{ id: 'send', type: 'send_email', templateId: 'template-1', next: null }],
};

describe('WorkflowService', () => {
  const service = new WorkflowService({} as never);

  it('accepts an acyclic worker-compatible definition', () => {
    expect(
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'send',
        nodes: [{ id: 'send', type: 'send_email', templateId: 'welcome', next: null }],
      }),
    ).toBe(true);
  });

  it('rejects cycles and unresolved node targets', () => {
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'a',
        nodes: [
          { id: 'a', type: 'branch', next: 'b', elseNext: null },
          { id: 'b', type: 'delay', next: 'a' },
        ],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'delay', next: 'missing' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects malformed and unsupported nodes', () => {
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'unknown',
        nodes: [{ id: 'bad id', type: 'unsupported' } as never],
      }),
    ).toThrow('Unsupported workflow node type');
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'delay',
        nodes: [{ id: 'delay', type: 'delay' }],
      }),
    ).toThrow('Delay nodes require');
  });

  it('rejects conditions over unsupported field namespaces', () => {
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up', filter: { field: 'email', op: 'exists' } },
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'exit' }],
      }),
    ).toThrow('must name a profile or event path');
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up' },
        entryNodeId: 'a',
        nodes: [
          {
            id: 'a',
            type: 'branch',
            condition: { field: 'traits.plan', op: 'eq', value: 'pro' },
            next: null,
            elseNext: null,
          },
        ],
      }),
    ).toThrow('Unsupported workflow condition field root "traits"');
  });

  it('rejects unsupported condition operators and operand types', () => {
    expect(() =>
      service.validate({
        trigger: { eventName: 'signed_up', filter: { field: 'profile.email', op: 'bogus' } },
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'exit' }],
      }),
    ).toThrow('Unsupported workflow condition operator');
    expect(() =>
      service.validate({
        trigger: {
          eventName: 'signed_up',
          filter: { field: 'profile.traits.plan', op: 'in', value: 'pro' },
        },
        entryNodeId: 'a',
        nodes: [{ id: 'a', type: 'exit' }],
      }),
    ).toThrow('requires an array value');
  });

  it('rejects workflows that reference templates or audiences outside the account', async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await expect(
      new WorkflowService(database as never).validateReferences('account-1', targetedDefinition),
    ).rejects.toThrow('Workflow references missing template template-1, audience audience-1');
  });

  it('returns the referenced audience rule so the trigger filter can carry it', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
        .mockResolvedValueOnce({
          rows: [{ rule: { field: 'profile.traits.plan', op: 'eq', value: 'pro' } }],
        }),
    };

    await expect(
      new WorkflowService(database as never).validateReferences('account-1', targetedDefinition),
    ).resolves.toEqual({
      audienceRule: { field: 'profile.traits.plan', op: 'eq', value: 'pro' },
    });
  });

  it('snapshots the audience rule into the stored trigger filter', async () => {
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'workflow-1' }])
      .mockResolvedValueOnce([{ id: 'version-1', version: 1 }]);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
        .mockResolvedValueOnce({
          rows: [{ rule: { field: 'traits.plan', op: 'eq', value: 'pro' } }],
        }),
      transaction: vi.fn((work: (client: unknown) => Promise<unknown>) =>
        work({ query: clientQuery }),
      ),
    };

    await new WorkflowService(database as never).create('account-1', {
      name: 'Welcome',
      definition: targetedDefinition,
    });

    const stored = JSON.parse(clientQuery.mock.calls[1][1][2]) as WorkflowDefinition;
    expect(stored.trigger.audienceId).toBe('audience-1');
    // The engine only reads filter, so the audience rule is folded in alongside the entry filter,
    // rebased from the audience namespace onto the run context it is evaluated against.
    expect(stored.trigger.filter).toEqual({
      all: [
        { field: 'profile.traits.plan', op: 'eq', value: 'pro' },
        { field: 'profile.email', op: 'exists' },
      ],
    });
  });

  it('stores an audience rule that publish accepts', async () => {
    const audienceRule = { field: 'traits.plan', op: 'eq', value: 'pro' };
    const clientQuery = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'workflow-1' }])
      .mockResolvedValueOnce([{ id: 'version-1', version: 1 }]);
    const createDatabase = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
        .mockResolvedValueOnce({ rows: [{ rule: audienceRule }] }),
      transaction: vi.fn((work: (client: unknown) => Promise<unknown>) =>
        work({ query: clientQuery }),
      ),
    };

    await new WorkflowService(createDatabase as never).create('account-1', {
      name: 'Welcome',
      definition: targetedDefinition,
    });
    const stored = JSON.parse(clientQuery.mock.calls[1][1][2]) as WorkflowDefinition;

    const publishDatabase = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ definition: stored }] })
        .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
        .mockResolvedValueOnce({ rows: [{ rule: audienceRule }] })
        .mockResolvedValueOnce({ rows: [{ id: 'workflow-1', status: 'active' }] }),
    };

    await expect(
      new WorkflowService(publishDatabase as never).publish('account-1', 'workflow-1'),
    ).resolves.toEqual({ id: 'workflow-1', status: 'active' });
  });

  it('re-checks the definition and its references before publishing', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ definition: targetedDefinition }] })
        .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(
      new WorkflowService(database as never).publish('account-1', 'workflow-1'),
    ).rejects.toThrow('Workflow references missing audience audience-1');
    expect(database.query).toHaveBeenCalledTimes(3);
  });
});
