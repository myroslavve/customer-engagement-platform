import { Injectable } from '@nestjs/common';
import { ComparisonOp, Condition } from './definition';
import { RunContext } from './run-context';

/** Pure evaluation of a Condition against a RunContext. Missing paths resolve to undefined. */
@Injectable()
export class ConditionEvaluator {
  evaluate(condition: Condition, ctx: RunContext): boolean {
    if ('all' in condition) return condition.all.every((c) => this.evaluate(c, ctx));
    if ('any' in condition) return condition.any.some((c) => this.evaluate(c, ctx));
    if ('not' in condition) return !this.evaluate(condition.not, ctx);
    return compare(condition.op, resolvePath(ctx, condition.field), condition.value);
  }
}

function resolvePath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, root);
}

function compare(op: ComparisonOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'nin':
      return Array.isArray(expected) && !expected.includes(actual);
    case 'contains':
      if (typeof actual === 'string' && typeof expected === 'string')
        return actual.includes(expected);
      return Array.isArray(actual) && actual.includes(expected);
    case 'gt':
      return sign(actual, expected) > 0;
    case 'gte':
      return sign(actual, expected) >= 0;
    case 'lt':
      return sign(actual, expected) < 0;
    case 'lte':
      return sign(actual, expected) <= 0;
  }
}

/**
 * Three-way comparison; ordering is defined only for number/number and string/string pairs
 * (strings compare lexicographically, which is correct for ISO-8601 timestamps).
 * Returns NaN when the pair is not orderable, so every comparison against it is false.
 */
function sign(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return Number.NaN;
}
