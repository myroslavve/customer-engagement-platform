/** Operators of a field Condition in workflow definitions; values are stored in definition JSON. */
export enum ComparisonOp {
  Eq = 'eq',
  Neq = 'neq',
  Gt = 'gt',
  Gte = 'gte',
  Lt = 'lt',
  Lte = 'lte',
  In = 'in',
  Nin = 'nin',
  Contains = 'contains',
  Exists = 'exists',
}
