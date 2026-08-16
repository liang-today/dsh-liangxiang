/**
 * Local incense earning rate by model. Voting is still on 今日梁案, not on
 * a model: weights only scale how fast a Host turns Effective Tokens into
 * the daily claim (Pro-equivalent tokens). Vote power stays 1 炷 = 1 vote.
 *
 * Exact DSH route ids, never display names (docs/001 Q11, docs/041).
 */
export const INCENSE_WEIGHT_POLICY_VERSION = 'incense-weight-v1-pro1-flash0.5'

/** Integer scale so Flash 0.5 never needs floating point in the ledger. */
export const INCENSE_WEIGHT_SCALE = 10_000

const MODEL_WEIGHT_BPS: Readonly<Record<string, number>> = {
  'deepseek-v4-pro': INCENSE_WEIGHT_SCALE,
  'deepseek-v4-flash': INCENSE_WEIGHT_SCALE / 2,
}

/**
 * Strip a context-window suffix such as `deepseek-v4-pro[1m]`.
 * Display labels are not accepted: those never look like this id form.
 */
export function canonicalModelId(modelId: string): string {
  const trimmed = modelId.trim().toLowerCase()
  const bracket = trimmed.indexOf('[')
  return bracket === -1 ? trimmed : trimmed.slice(0, bracket)
}

/**
 * Earning weight for one usage delta.
 * Missing / unknown ids use Pro (= 1): the unit of 1 炷 is Pro-equivalent.
 * Flash is the discounted exception.
 */
export function incenseWeightBpsForModel(modelId: string | null | undefined): number {
  if (modelId === undefined || modelId === null || modelId.trim() === '') {
    return INCENSE_WEIGHT_SCALE
  }
  const canonical = canonicalModelId(modelId)
  return MODEL_WEIGHT_BPS[canonical] ?? INCENSE_WEIGHT_SCALE
}

/**
 * Scale a raw token count by a weight, carrying the leftover so Flash 1-token
 * steps can still accumulate (floor(1 * 0.5) would otherwise be forever 0).
 */
export function scaleTokensByWeightBps(
  rawCount: number,
  weightBps: number,
  carry: number,
): { scaled: number, carry: number } {
  const total = rawCount * weightBps + carry
  return {
    scaled: Math.floor(total / INCENSE_WEIGHT_SCALE),
    carry: total % INCENSE_WEIGHT_SCALE,
  }
}

/** Split a scaled total back into input/output, preserving the raw ratio. */
export function splitScaledTokens(
  scaled: number,
  deltaInput: number,
  deltaOutput: number,
): { input: number, output: number } {
  const raw = deltaInput + deltaOutput
  if (scaled === 0 || raw === 0) return { input: 0, output: 0 }
  const input = Math.floor((scaled * deltaInput) / raw)
  return { input, output: scaled - input }
}
