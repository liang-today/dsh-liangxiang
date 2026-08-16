/**
 * EffectiveTokenPolicy — frozen product definition (AGENTS.md §5):
 *
 *   Effective Token = Input Token + Output Token
 *
 * The domain only understands the normalized `{ inputTokens, outputTokens }`
 * shape. Mapping DSH's provider-reported buckets (uncached / cache-read /
 * cache-write) onto `inputTokens` lives in `compat/dsh`, never here.
 * Reasoning tokens are already included in output by the verified DSH
 * contract and must not arrive as a separate input.
 */
import { DomainError, assertCount } from './errors.ts'

/** Default 50,000 effective tokens = 1 incense stick (configurable per case). */
export const DEFAULT_TOKEN_PER_INCENSE = 50_000

/** Normalized provider-reported usage. Both fields are cumulative counts. */
export interface TokenUsageInput {
  inputTokens: number
  outputTokens: number
}

/** Validate and fold normalized usage into effective tokens. */
export function computeEffectiveTokens(usage: TokenUsageInput): number {
  assertCount(usage.inputTokens, 'invalid_token_count', 'inputTokens')
  assertCount(usage.outputTokens, 'invalid_token_count', 'outputTokens')
  const effective = usage.inputTokens + usage.outputTokens
  if (!Number.isSafeInteger(effective)) {
    throw new DomainError('invalid_token_count', `effective tokens overflow: ${usage.inputTokens} + ${usage.outputTokens}`)
  }
  return effective
}

/** Validate a token-per-incense policy value (positive safe integer). */
export function assertTokenPerIncense(tokenPerIncense: number): void {
  if (!Number.isSafeInteger(tokenPerIncense) || tokenPerIncense <= 0) {
    throw new DomainError('invalid_policy', `tokenPerIncense must be a positive safe integer, got ${String(tokenPerIncense)}`)
  }
}
