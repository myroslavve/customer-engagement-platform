export function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; driverError?: { code?: string } };
  return candidate.code === '23503' || candidate.driverError?.code === '23503';
}
