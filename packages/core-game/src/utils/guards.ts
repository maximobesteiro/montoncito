/** Narrow T | undefined | null to T with a runtime check (strict-mode friendly). */
export function must<T>(
  value: T | undefined | null,
  msg = "Unexpected undefined"
): T {
  if (value == null) throw new Error(msg);
  return value;
}

/** Simple invariant helper for code paths we consider impossible. */
export function invariant(
  cond: unknown,
  msg = "Invariant failed"
): asserts cond {
  if (!cond) throw new Error(msg);
}
