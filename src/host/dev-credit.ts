/**
 * Local-only simulated Token credit. This is how a developer pumps 香火
 * without talking to a model. It must never reach DEV_STAGING_ONLY: that
 * path would POST a fake claim to the shared backend.
 */
export const DEV_CREDIT_SESSION_ID = '__liangbiao_dev_sim__'
export const DEV_CREDIT_MAX_STICKS = 50
export const DEV_CREDIT_MAX_TOKENS = 5_000_000

export interface DevCreditIntent {
  /** Add this many Pro-equivalent tokens. Mutually exclusive with sticks. */
  effectiveTokens?: number
  /** Add this many full incense sticks (tokens = sticks * tokenPerIncense). */
  sticks?: number
}

export function parseDevCreditBody(raw: unknown): DevCreditIntent {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('dev credit body must be an object')
  }
  const record = raw as Record<string, unknown>
  const hasSticks = record.sticks !== undefined
  const hasTokens = record.effectiveTokens !== undefined
  if (hasSticks === hasTokens) {
    throw new Error('dev credit body must set exactly one of sticks or effectiveTokens')
  }
  if (hasSticks) {
    const sticks = record.sticks
    if (typeof sticks !== 'number' || !Number.isInteger(sticks) || sticks < 1 || sticks > DEV_CREDIT_MAX_STICKS) {
      throw new Error(`sticks must be an integer 1–${DEV_CREDIT_MAX_STICKS}`)
    }
    return { sticks }
  }
  const effectiveTokens = record.effectiveTokens
  if (
    typeof effectiveTokens !== 'number'
    || !Number.isInteger(effectiveTokens)
    || effectiveTokens < 1
    || effectiveTokens > DEV_CREDIT_MAX_TOKENS
  ) {
    throw new Error(`effectiveTokens must be an integer 1–${DEV_CREDIT_MAX_TOKENS}`)
  }
  return { effectiveTokens }
}

export function resolveDevCreditTokens(intent: DevCreditIntent, tokenPerIncense: number): number {
  if (intent.sticks !== undefined) return intent.sticks * tokenPerIncense
  if (intent.effectiveTokens !== undefined) return intent.effectiveTokens
  throw new Error('dev credit intent is empty')
}
