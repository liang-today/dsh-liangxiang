/**
 * Brand-migration environment lookup.
 *
 * New configuration is always `LIANGXIANG_*`. During the v0.5 migration we
 * still read the former `LIANGBIAO_*` spelling when the new key is absent, so
 * an existing Host or backend can restart without losing its endpoint, key,
 * database path, or policy. New keys win even when explicitly set to an empty
 * string; this lets operators intentionally disable an inherited legacy value.
 */
export function readLiangxiangEnv(
  env: Record<string, string | undefined>,
  suffix: string,
): string | undefined {
  const current = env[`LIANGXIANG_${suffix}`]
  if (current !== undefined) return current
  return env[`LIANGBIAO_${suffix}`]
}
