import { isBusinessDate } from './case.ts'

/** Declarative model-family metadata, shared by accounting and its tooltip. */
export interface IncenseWeightRule {
  label: string
  model: string
  provider?: string
  weightBps: number
}

export interface IncenseWeightPolicy {
  version: string
  revision: number
  effectiveFrom: string
  fallbackWeightBps: number
  rules: readonly IncenseWeightRule[]
}

export const INCENSE_WEIGHT_POLICY_VERSION = 'incense-weight-v4-static-pro1-others0.5'

/** Integer scale so Flash 0.5 never needs floating point in the ledger. */
export const INCENSE_WEIGHT_SCALE = 10_000

export const LEGACY_INCENSE_WEIGHT_POLICY: IncenseWeightPolicy = {
  version: 'incense-weight-v2-pro1-others0.5',
  revision: 2,
  effectiveFrom: '1970-01-01',
  fallbackWeightBps: 5_000,
  rules: [
    { label: 'V4-Pro', model: 'deepseek-v4-pro', weightBps: 10_000 },
    { label: 'V4-Flash', model: 'deepseek-*-flash*', weightBps: 5_000 },
  ],
}

export const DEFAULT_INCENSE_WEIGHT_POLICY: IncenseWeightPolicy = {
  version: INCENSE_WEIGHT_POLICY_VERSION,
  revision: 4,
  effectiveFrom: '1970-01-01',
  fallbackWeightBps: 5_000,
  rules: [
    { label: 'Flash', model: 'deepseek-flash', weightBps: 5_000 },
    { label: 'Flash', model: 'deepseek-*-flash', weightBps: 5_000 },
    { label: 'Flash', model: 'deepseek-*-flash-*', weightBps: 5_000 },
    { label: 'Pro', model: 'deepseek-pro', weightBps: 10_000 },
    { label: 'Pro', model: 'deepseek-*-pro', weightBps: 10_000 },
    { label: 'Pro', model: 'deepseek-*-pro-*', weightBps: 10_000 },
  ],
}

/** Validate wire metadata and readable legacy storage with one parser. */
export function parseIncenseWeightPolicy(raw: unknown): IncenseWeightPolicy {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('invalid incense weight policy')
  const value = raw as Record<string, unknown>
  if (typeof value.version !== 'string' || !/^[a-z0-9._-]{1,80}$/.test(value.version)) throw new Error('invalid weight policy version')
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 1) throw new Error('invalid weight policy revision')
  if (!isBusinessDate(value.effectiveFrom)) throw new Error('invalid weight policy effective date')
  const weight = (rawWeight: unknown): number => {
    if (rawWeight !== 5_000 && rawWeight !== 10_000) throw new Error('weight must be 5000 or 10000')
    return rawWeight
  }
  const pattern = (rawPattern: unknown): string => {
    if (typeof rawPattern !== 'string' || !/^[a-z0-9][a-z0-9._/*:-]{0,95}$/.test(rawPattern)
      || rawPattern.split('*').length > 5) throw new Error('invalid model/provider pattern')
    return rawPattern
  }
  if (!Array.isArray(value.rules) || value.rules.length > 24) throw new Error('at most 24 model rules are allowed')
  const rules = value.rules.map((rawRule): IncenseWeightRule => {
    if (typeof rawRule !== 'object' || rawRule === null) throw new Error('invalid model rule')
    const rule = rawRule as Record<string, unknown>
    if (typeof rule.label !== 'string' || rule.label.length === 0 || [...rule.label].length > 24
      || [...rule.label].some(char => (char.codePointAt(0) ?? 0) <= 31 || char.codePointAt(0) === 127)) throw new Error('invalid model rule label')
    return {
      label: rule.label,
      model: pattern(rule.model),
      ...(rule.provider === undefined ? {} : { provider: pattern(rule.provider) }),
      weightBps: weight(rule.weightBps),
    }
  })
  return {
    version: value.version,
    revision: value.revision as number,
    effectiveFrom: value.effectiveFrom,
    fallbackWeightBps: weight(value.fallbackWeightBps),
    rules,
  }
}

/** Whole-ID, bounded glob matching. No arbitrary regexes or display names. */
function matches(pattern: string, value: string): boolean {
  const parts = pattern.split('*')
  if (parts.length === 1) return value === pattern
  const first = parts[0] ?? ''
  const last = parts.at(-1) ?? ''
  if (!value.startsWith(first) || !value.endsWith(last)) return false
  let offset = first.length
  for (const part of parts.slice(1, -1)) {
    const found = value.indexOf(part, offset)
    if (found < 0) return false
    offset = found + part.length
  }
  return offset <= value.length - last.length
}

/**
 * Strip a context-window suffix such as `deepseek-v4-pro[1m]`.
 * Display labels are not accepted: those never look like this id form.
 */
export function canonicalModelId(modelId: string): string {
  const trimmed = modelId.trim().toLowerCase()
  return trimmed.replace(/\[[1-9]\d{0,8}[km]?\]$/, '')
}

/**
 * Static earning rate: DeepSeek Pro ×1; Flash and everything else ×0.5.
 * The complete route ID selects a family, never its version or display name.
 */
export function incenseWeightBpsForModel(
  modelId: string | null | undefined,
): number {
  const policy = DEFAULT_INCENSE_WEIGHT_POLICY
  if (modelId === undefined || modelId === null || modelId.trim() === '') {
    return policy.fallbackWeightBps
  }
  const canonical = canonicalModelId(modelId)
  // A display label or malformed suffix must not inherit a Pro-looking prefix.
  if (!/^[a-z0-9][a-z0-9._-]{0,159}$/.test(canonical)) return policy.fallbackWeightBps
  return policy.rules.find(rule => matches(rule.model, canonical))?.weightBps
    ?? policy.fallbackWeightBps
}

/** Tooltip rows are derived from the same policy used for accounting. */
export function incenseWeightRows(policy: IncenseWeightPolicy, tokenPerIncense: number): Array<{
  model: string, weight: string, stick: string,
}> {
  const groups = new Map<string, { model: string, weight: string, stick: string }>()
  for (const rule of [...policy.rules, { label: '其它', weightBps: policy.fallbackWeightBps }]) {
    const rawTokens = Math.ceil(tokenPerIncense * INCENSE_WEIGHT_SCALE / rule.weightBps)
    const key = `${rule.label}:${rule.weightBps}`
    groups.set(key, {
      model: rule.label,
      weight: `×${rule.weightBps / INCENSE_WEIGHT_SCALE}`,
      stick: `${rawTokens % 10_000 === 0 ? `${rawTokens / 10_000}W` : rawTokens.toLocaleString('zh-CN')} Token/炷`,
    })
  }
  return [...groups.values()]
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
  // Split first so even safe-integer raw counts cannot overflow ×10,000.
  const total = (rawCount % INCENSE_WEIGHT_SCALE) * weightBps + carry
  return {
    scaled: Math.floor(rawCount / INCENSE_WEIGHT_SCALE) * weightBps + Math.floor(total / INCENSE_WEIGHT_SCALE),
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
