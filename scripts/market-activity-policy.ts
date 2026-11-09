/** Bounded synthetic behaviour; this never grants credit or edits chart data. */
export interface ActivityPolicy {
  random: number
  probability: number
  target: number
  regimeUntil: number
  nextAt: number
  cursor: number
  actorDue: number[]
}
export function random(policy: ActivityPolicy): number {
  let x = policy.random | 0
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5
  policy.random = x >>> 0
  return policy.random / 0x100000000
}
export function activityIntent(policy: ActivityPolicy, now: number, available: readonly number[], ratio: number | null): { actor: number; vote_type: 'up' | 'down'; count: number } | null {
  if (now < policy.nextAt) return null
  if (now >= policy.regimeUntil) {
    policy.target = 0.16 + random(policy) * 0.68
    policy.regimeUntil = now + 3_000 + random(policy) * 5_000
  }
  policy.probability += (policy.target - policy.probability) * 0.055
  policy.nextAt = now + 90 + Math.floor(random(policy) * 36)
  for (let offset = 0; offset < available.length; offset++) {
    const actor = (policy.cursor + offset) % available.length
    const budget = Math.floor(available[actor] ?? 0) - 600
    if (budget < 1 || (policy.actorDue[actor] ?? 0) > now) continue
    policy.cursor = (actor + 1) % available.length
    policy.actorDue[actor] = now + 300 + random(policy) * 700
    let probability = policy.probability + ((actor % 5) - 2) * 0.035
    if (ratio !== null && ratio < 0.2) probability = Math.max(probability, 0.62)
    if (ratio !== null && ratio > 0.8) probability = Math.min(probability, 0.38)
    probability = Math.max(0.08, Math.min(0.92, probability))
    return { actor, vote_type: random(policy) < probability ? 'up' : 'down', count: Math.min(budget, 1 + Math.floor(random(policy) * 3)) }
  }
  return null
}
