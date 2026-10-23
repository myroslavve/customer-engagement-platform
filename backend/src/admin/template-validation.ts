import { BadRequestException } from '@nestjs/common';

/**
 * A template body may only contain well-formed `{{path}}` placeholders over the run context, so a
 * malformed template is rejected at save time instead of rendering as literal text at send time.
 */

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Roots of the run context a placeholder may address. */
const CONTEXT_ROOTS = new Set(['profile', 'event']);
const PROFILE_KEYS = new Set(['id', 'externalId', 'email', 'traits']);
const EVENT_KEYS = new Set(['id', 'name', 'occurredAt', 'properties']);

export function validateTemplateVariables(...texts: string[]): void {
  for (const text of texts) {
    scanPlaceholders(text).forEach(assertValidPlaceholder);
  }
}

/**
 * Collects the path of every `{{path}}` in the text. Delimiters are scanned rather than matched and
 * stripped: stripping `{{firstName}}` out of `{{{firstName}}}` leaves a balanced `{}` behind, so a
 * brace run would pass the remainder check and reach the renderer as `{value}`.
 */
function scanPlaceholders(text: string): string[] {
  const paths: string[] = [];
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('{{', index)) {
      const close = text.indexOf('}}', index + 2);
      if (close === -1) {
        throw new BadRequestException('Template contains an unclosed placeholder');
      }
      const body = text.slice(index + 2, close);
      if (body.includes('{') || body.includes('}')) {
        throw new BadRequestException('Template contains a malformed placeholder');
      }
      paths.push(body.trim());
      index = close + 2;
      continue;
    }
    if (text.startsWith('}}', index)) {
      throw new BadRequestException(
        'Template contains a closing placeholder delimiter with no opening',
      );
    }
    index += 1;
  }
  return paths;
}

/**
 * A bare name is shorthand for a profile trait (`{{firstName}}`), or a profile field when no such
 * trait exists (`{{email}}`); a rooted path must name a real key of the run context, so
 * `{{profile.name}}` is rejected rather than silently rendering as nothing.
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
