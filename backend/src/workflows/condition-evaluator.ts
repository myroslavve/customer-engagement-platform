import { Injectable } from '@nestjs/common';
import { ComparisonOp } from '../enums/comparison-op.enum';
import { RunContext } from '../types/run-context.types';
import { Condition } from '../types/workflow-definition.types';
import { resolvePath } from './resolve-path';

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

function compare(op: ComparisonOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case ComparisonOp.Exists:
      return actual !== undefined && actual !== null;
    case ComparisonOp.Eq:
      return actual === expected;
    case ComparisonOp.Neq:
      return actual !== expected;
    case ComparisonOp.In:
      return Array.isArray(expected) && expected.includes(actual);
    case ComparisonOp.Nin:
      return Array.isArray(expected) && !expected.includes(actual);
    case ComparisonOp.Contains:
      if (typeof actual === 'string' && typeof expected === 'string')
        return actual.includes(expected);
      return Array.isArray(actual) && actual.includes(expected);
    case ComparisonOp.Gt:
      return sign(actual, expected) > 0;
    case ComparisonOp.Gte:
      return sign(actual, expected) >= 0;
    case ComparisonOp.Lt:
      return sign(actual, expected) < 0;
    case ComparisonOp.Lte:
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
