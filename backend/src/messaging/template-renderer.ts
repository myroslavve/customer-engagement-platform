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
      const value = this.stringify(this.resolve(path, variables));
      return escapeHtml ? value.replace(HTML_SPECIAL_CHARS, (char) => HTML_ESCAPES[char]) : value;
    });
  }

  /**
   * A bare name is shorthand for a profile trait (`{{firstName}}`), falling back to a profile field
   * when there is no such trait (`{{email}}`); a dotted path is looked up as written.
   */
  private resolve(path: string, variables: RunContext): unknown {
    const direct = resolvePath(variables, path);
    if (direct !== undefined || path.includes('.')) return direct;
    return resolvePath(variables.profile, `traits.${path}`) ?? resolvePath(variables.profile, path);
  }

  /** Primitives render as text; missing, null, objects and arrays render as nothing. */
  private stringify(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return '';
  }
}
