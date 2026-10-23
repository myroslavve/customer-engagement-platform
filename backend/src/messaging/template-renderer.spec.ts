import { describe, expect, it } from 'vitest';
import { Template } from '../database/entities/template.entity';
import { RunContext } from '../types/run-context.types';
import { TemplateRenderer } from './template-renderer';

const template = {
  subject: 'Hi {{firstName}}',
  body: '<p>{{profile.traits.plan}}</p>',
} as Template;

const variables: RunContext = {
  profile: {
    id: 'profile-1',
    externalId: 'user-1',
    email: 'one@example.com',
    traits: { firstName: 'Ada', plan: 'pro' },
  },
  event: null,
};

describe('TemplateRenderer', () => {
  it('resolves a bare name as a profile trait', () => {
    const rendered = new TemplateRenderer().render(template, 'one@example.com', variables, 'key-1');

    expect(rendered.subject).toBe('Hi Ada');
    expect(rendered.html).toBe('<p>pro</p>');
  });

  it('falls back to a profile field when there is no such trait', () => {
    const rendered = new TemplateRenderer().render(
      { subject: '{{email}}', body: '' } as Template,
      'one@example.com',
      variables,
      'key-1',
    );

    expect(rendered.subject).toBe('one@example.com');
  });

  it('renders a missing value as nothing rather than the path', () => {
    const rendered = new TemplateRenderer().render(
      { subject: '{{profile.traits.lastName}}', body: '{{event.name}}' } as Template,
      'one@example.com',
      variables,
      'key-1',
    );

    expect(rendered.subject).toBe('');
    expect(rendered.html).toBe('');
  });

  it('escapes HTML in the body but not in the subject', () => {
    const rendered = new TemplateRenderer().render(
      { subject: '{{profile.traits.lastName}}', body: '{{profile.traits.lastName}}' } as Template,
      'one@example.com',
      {
        ...variables,
        profile: { ...variables.profile, traits: { lastName: '<b>Ada</b>' } },
      },
      'key-1',
    );

    expect(rendered.subject).toBe('<b>Ada</b>');
    expect(rendered.html).toBe('&lt;b&gt;Ada&lt;/b&gt;');
  });
});
