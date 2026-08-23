/**
 * IncenseAccountingPolicy + LiangQi progress — the personal side of 梁相.
 *
 * Frozen formulas (AGENTS.md §5):
 *
 *   earned    = floor(effectiveTokensToday / tokenPerIncense)
 *   remaining = earned - used
 *   remainder = effectiveTokensToday % tokenPerIncense
 *   fill      = remainder / tokenPerIncense
 *   toNext    = tokenPerIncense - remainder
 *
 * Personal state never selects the central Liangzi state; that is the global
 * snapshot's job (see `liangzi.ts`). Spending incense changes only `used` /
 * `remaining`; the token remainder (ring fill) is untouched by design.
 */
import { DomainError, assertCount } from './errors.ts'
import { DEFAULT_TOKEN_PER_INCENSE, assertTokenPerIncense } from './tokens.ts'

/** Inputs of the daily personal accounting fold. */
export interface IncenseAccountingInput {
  /** Today's validated effective tokens (input + output). */
  effectiveTokensToday: number
  /** Accepted up votes + accepted down votes by this user today. */
  usedIncenseToday: number
  /** Case policy; defaults to 50,000. */
  tokenPerIncense?: number
}

/** Serializable personal LiangQi state (no personal tier — by contract). */
export interface PersonalLiangQiState {
  effectiveTokensToday: number
  tokenPerIncense: number
  earnedIncenseToday: number
  usedIncenseToday: number
  remainingIncense: number
  tokenRemainder: number
  tokensToNextIncense: number
  /** 0..1 (exclusive of 1): progress of the next incense stick. */
  liangQiFill: number
}

/** Fold effective tokens + accepted personal votes into PersonalLiangQiState. */
export function derivePersonalLiangQiState(input: IncenseAccountingInput): PersonalLiangQiState {
  const tokenPerIncense = input.tokenPerIncense ?? DEFAULT_TOKEN_PER_INCENSE
  assertTokenPerIncense(tokenPerIncense)
  assertCount(input.effectiveTokensToday, 'invalid_token_count', 'effectiveTokensToday')
  assertCount(input.usedIncenseToday, 'invalid_incense_count', 'usedIncenseToday')

  const earnedIncenseToday = Math.floor(input.effectiveTokensToday / tokenPerIncense)
  if (input.usedIncenseToday > earnedIncenseToday) {
    throw new DomainError(
      'used_exceeds_earned',
      `usedIncenseToday (${input.usedIncenseToday}) exceeds earnedIncenseToday (${earnedIncenseToday})`,
    )
  }
  const tokenRemainder = input.effectiveTokensToday % tokenPerIncense
  return {
    effectiveTokensToday: input.effectiveTokensToday,
    tokenPerIncense,
    earnedIncenseToday,
    usedIncenseToday: input.usedIncenseToday,
    remainingIncense: earnedIncenseToday - input.usedIncenseToday,
    tokenRemainder,
    tokensToNextIncense: tokenPerIncense - tokenRemainder,
    liangQiFill: tokenRemainder / tokenPerIncense,
  }
}

/** Whether the user can currently place one more vote. */
export function canSpendIncense(state: PersonalLiangQiState): boolean {
  return state.remainingIncense > 0
}

/**
 * Spend exactly one incense stick (one accepted vote). Token remainder, ring
 * fill and tokens-to-next are invariant under spending — only used/remaining
 * move. Throws `insufficient_incense` when the pool is empty.
 */
export function spendOneIncense(state: PersonalLiangQiState): PersonalLiangQiState {
  return spendIncense(state, 1)
}

/**
 * Spend `count` sticks in one fold. Token remainder / ring fill stay still.
 * Throws `insufficient_incense` when the pool cannot cover the whole count.
 */
export function spendIncense(state: PersonalLiangQiState, count: number): PersonalLiangQiState {
  assertCount(count, 'invalid_incense_count', 'spendCount')
  if (count < 1 || count > state.remainingIncense) {
    throw new DomainError('insufficient_incense', 'no remaining incense to spend')
  }
  return derivePersonalLiangQiState({
    effectiveTokensToday: state.effectiveTokensToday,
    usedIncenseToday: state.usedIncenseToday + count,
    tokenPerIncense: state.tokenPerIncense,
  })
}
