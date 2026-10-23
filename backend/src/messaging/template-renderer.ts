import { Injectable } from '@nestjs/common';
import { Template } from '../database/entities/template.entity';
import { RenderedEmail } from '../types/rendered-email.types';
import { RunContext } from '../types/run-context.types';
import { resolvePath } from '../workflows/resolve-path';

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;
const HTML_SPECIAL_CHARS = /[&<>"']/g;
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** {{path}} substitution into the RunContext snapshot; HTML-escaped in the body, raw in the subject. */
@Injectable()
export class TemplateRenderer {
  render(
    template: Template,
    to: string,
    variables: RunContext,
    idempotencyKey: string,
  ): RenderedEmail {
    return {
      to,
      subject: this.substitute(template.subject, variables, false),
      html: this.substitute(template.body, variables, true),
      idempotencyKey,
    };
  }

  private substitute(text: string, variables: RunContext, escapeHtml: boolean): string {
    return text.replace(PLACEHOLDER, (_match, path: string) => {
      const value = stringify(resolvePath(variables, path));
      return escapeHtml ? value.replace(HTML_SPECIAL_CHARS, (char) => HTML_ESCAPES[char]) : value;
    });
  }
}

/** Primitives render as text; missing, null, objects and arrays render as nothing. */
function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}
