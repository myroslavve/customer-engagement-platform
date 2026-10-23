import { z } from 'zod';

/**
 * Validates raw env values against a config schema; throws one readable error listing every issue.
 * Empty strings (VAR= in .env) count as unset, so optional fields and defaults apply.
 */
export function parseConfig<T extends z.ZodTypeAny>(
  name: string,
  schema: T,
  values: Record<string, string | undefined>,
): z.infer<T> {
  const present = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value === '' ? undefined : value]),
  );
  const result = schema.safeParse(present);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid ${name} config: ${issues}`);
  }
  return result.data;
}

/** Env flags arrive as strings; z.coerce.boolean() would read "false" as true. */
export const envBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');
