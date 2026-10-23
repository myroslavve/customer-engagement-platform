import { BadRequestException } from '@nestjs/common';
import { ComparisonOp } from '../enums/comparison-op.enum';

/**
 * Shape validation shared by audience rules and workflow conditions: both are boolean trees of leaf
 * rules (`{ field, op, value? }`) over a field namespace. Evaluation lives in ConditionEvaluator and
 * AudienceService; this only rejects malformed rules before anything is stored.
 */

/** Operators accepted on a leaf rule; the values travel through definition and audience JSON. */
export const RULE_OPERATORS = new Set<string>(Object.values(ComparisonOp));

const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export type RuleValidationOptions = {
  /** Noun for rule-shape messages, e.g. "Audience"; its lowercase form names the operator. */
  ruleLabel: string;
  /** Noun for field messages, e.g. "audience rule field". */
  fieldLabel: string;
  /** First path segments a multi-segment field may use. */
  roots: Set<string>;
  /** Whether a bare name (a profile shorthand) is allowed instead of a rooted path. */
  allowShorthand?: boolean;
};

export function validateRule(rule: unknown, options: RuleValidationOptions): void {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new BadRequestException(`Invalid ${options.ruleLabel} rule`);
  }
  const node = rule as Record<string, unknown>;
  if ('all' in node || 'any' in node) {
    const children = 'all' in node ? node.all : node.any;
    if (!Array.isArray(children) || children.length === 0) {
      throw new BadRequestException(`${options.ruleLabel} groups must contain rules`);
    }
    children.forEach((child) => validateRule(child, options));
    return;
  }
  if ('not' in node) {
    validateRule(node.not, options);
    return;
  }
  const { field, op, value } = node;
  if (typeof field !== 'string' || !field || typeof op !== 'string') {
    throw new BadRequestException(`${options.ruleLabel} leaf rules require field and operator`);
  }
  validateRuleField(field, options);
  if (!RULE_OPERATORS.has(op)) {
    throw new BadRequestException(`Unsupported ${options.ruleLabel.toLowerCase()} operator: ${op}`);
  }
  assertRuleValue(options.ruleLabel, op, value);
}

export function validateRuleField(field: string, options: RuleValidationOptions): void {
  if (!FIELD_PATH.test(field)) {
    throw new BadRequestException(`Invalid ${options.fieldLabel} path: ${field}`);
  }
  const segments = field.split('.');
  if (segments.length === 1) {
    if (options.allowShorthand !== false) return;
    throw new BadRequestException(
      `The ${options.fieldLabel} "${field}" must name a ${[...options.roots].join(' or ')} path`,
    );
  }
  if (!options.roots.has(segments[0])) {
    throw new BadRequestException(
      `Unsupported ${options.fieldLabel} root "${segments[0]}" in ${field}; expected one of: ` +
        [...options.roots].join(', '),
    );
  }
}

/** Field paths referenced anywhere in a rule, so callers can tell profile-only from event-aware. */
export function collectRuleFields(rule: unknown, into: Set<string> = new Set()): Set<string> {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return into;
  const node = rule as Record<string, unknown>;
  if ('all' in node || 'any' in node) {
    const children = 'all' in node ? node.all : node.any;
    if (Array.isArray(children)) children.forEach((child) => collectRuleFields(child, into));
    return into;
  }
  if ('not' in node) {
    collectRuleFields(node.not, into);
    return into;
  }
  if (typeof node.field === 'string') into.add(node.field);
  return into;
}

function assertRuleValue(ruleLabel: string, op: string, value: unknown): void {
  switch (op) {
    case ComparisonOp.Exists:
      return;
    case ComparisonOp.In:
    case ComparisonOp.Nin:
      if (!Array.isArray(value)) {
        throw new BadRequestException(`${ruleLabel} operator "${op}" requires an array value`);
      }
      return;
    case ComparisonOp.Gt:
    case ComparisonOp.Gte:
    case ComparisonOp.Lt:
    case ComparisonOp.Lte:
      if (typeof value !== 'number' && typeof value !== 'string') {
        throw new BadRequestException(
          `${ruleLabel} operator "${op}" requires a number or string value`,
        );
      }
      return;
    default:
      if (value === undefined) {
        throw new BadRequestException(`${ruleLabel} operator "${op}" requires a value`);
      }
  }
}
