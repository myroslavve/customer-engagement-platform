import { BadRequestException } from '@nestjs/common';

/**
 * A template body may only contain well-formed `{{path}}` placeholders over the run context, so a
 * malformed template is rejected at save time instead of rendering as literal text at send time.
 */

/** A placeholder may not contain braces, which also rejects nesting and unclosed shapes. */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Roots of the run context a placeholder may address. */
const CONTEXT_ROOTS = new Set(['profile', 'event']);
const PROFILE_KEYS = new Set(['id', 'externalId', 'email', 'traits']);
const EVENT_KEYS = new Set(['id', 'name', 'occurredAt', 'properties']);

export function validateTemplateVariables(...texts: string[]): void {
  for (const text of texts) {
    const tokens: string[] = [];
    const remainder = text.replace(PLACEHOLDER, (_match, path: string) => {
      tokens.push(path);
      return '';
    });
    // Anything left that looks like a brace is a token without its other half.
    if (remainder.includes('{{') || remainder.includes('}}')) {
      throw new BadRequestException('Template contains an unclosed or malformed placeholder');
    }
    tokens.forEach(assertValidPlaceholder);
  }
}

/**
 * A bare name is a profile trait shorthand (`{{firstName}}`); a rooted path must name a real key of
 * the run context, so `{{profile.name}}` is rejected rather than silently rendering as nothing.
 */
function assertValidPlaceholder(token: string): void {
  if (!FIELD_PATH.test(token)) {
    throw new BadRequestException(`Invalid template placeholder: {{${token}}}`);
  }
  const segments = token.split('.');
  if (segments.length === 1) return;
  const root = segments[0];
  if (!CONTEXT_ROOTS.has(root)) {
    throw new BadRequestException(
      `Unsupported template placeholder root "${root}" in {{${token}}}; expected one of: ` +
        [...CONTEXT_ROOTS].join(', '),
    );
  }
  const keys = root === 'profile' ? PROFILE_KEYS : EVENT_KEYS;
  if (!keys.has(segments[1])) {
    throw new BadRequestException(
      `Unsupported template placeholder "{{${token}}}"; ${root} fields are: ` +
        [...keys].join(', '),
    );
  }
}
