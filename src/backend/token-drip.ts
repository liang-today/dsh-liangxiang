/**
 * Cap how fast a host-observed Token claim can mint incense.
 *
 * Default 50,000 tokens / minute (= 1 炷 / minute at the frozen 50K policy).
 * This is a drip against a lying Host, not verification that DSH really ran.
 * Time is the backend clock (NTP-synced OS time on a VPS). 0 disables the cap.
 */
export function cappedClaimedTokens(input: {
  requested: number
  current: number
  identityCreatedAt: number
  now: number
  maxTokensPerMinute: number
}): number {
  if (input.requested < input.current) return input.current
  if (input.maxTokensPerMinute <= 0) return input.requested
  const elapsedMs = Math.max(0, input.now - input.identityCreatedAt)
  const maxTotal = Math.floor((elapsedMs / 60_000) * input.maxTokensPerMinute)
  return Math.max(input.current, Math.min(input.requested, maxTotal))
}
