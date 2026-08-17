/** Read a Liangxiang configuration value from its canonical namespace. */
export function readLiangxiangEnv(
  env: Record<string, string | undefined>,
  suffix: string,
): string | undefined {
  return env[`LIANGXIANG_${suffix}`]
}
