type WaitForOptions = { timeoutMs?: number; intervalMs?: number };

/** Polls fn until predicate accepts its value; throws with the last value on timeout. */
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = 10_000, intervalMs = 50 }: WaitForOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `waitFor timed out after ${timeoutMs} ms; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
