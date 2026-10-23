/** Dot-path lookup ("profile.traits.plan") into plain objects; undefined for any missing segment. */
export function resolvePath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, root);
}
