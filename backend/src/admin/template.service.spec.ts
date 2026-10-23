import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { TemplateService } from './template.service';

describe('TemplateService', () => {
  it('creates a template with the account scope', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'template-1' }] })
    };
    const service = new TemplateService(database as never);

    await expect(
      service.create('account-1', {
        name: 'Welcome',
        subject: 'Hello',
        body: '<p>Hello</p>'
      })
    ).resolves.toEqual({ id: 'template-1' });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO templates'),
      ['account-1', 'Welcome', 'Hello', '<p>Hello</p>']
    );
  });

  it('rejects updates for templates outside the account', async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };
    const service = new TemplateService(database as never);

    await expect(
      service.update('account-1', 'template-1', {
        name: 'Updated',
        subject: 'Subject',
        body: 'Body'
      })
    ).rejects.toThrow(NotFoundException);
  });
});
