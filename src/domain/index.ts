/**
 * Domain layer: pure Liangbiao V0.1 logic — global Liangzi state policy,
 * personal incense accounting, LiangQi progress, vote vocabulary.
 *
 * Layer boundary, enforced by review: no React, no DSH, no Node imports are
 * ever allowed in this directory; every function must stay pure and
 * independently testable.
 */
export { DomainError, assertCount, type DomainErrorCode } from './errors.ts'
export {
  DEFAULT_TOKEN_PER_INCENSE,
  assertTokenPerIncense,
  computeEffectiveTokens,
  type TokenUsageInput,
} from './tokens.ts'
export {
  INCENSE_WEIGHT_POLICY_VERSION,
  INCENSE_WEIGHT_SCALE,
  canonicalModelId,
  incenseWeightBpsForModel,
  scaleTokensByWeightBps,
  splitScaledTokens,
} from './incense-weight.ts'
export {
  canSpendIncense,
  derivePersonalLiangQiState,
  spendOneIncense,
  type IncenseAccountingInput,
  type PersonalLiangQiState,
} from './incense.ts'
export {
  ACTIVE_LIANGZI_STATES,
  DEFAULT_LIANGZI_THRESHOLDS,
  LIANGZI_STATES,
  assertValidThresholdPolicy,
  deriveLiangziState,
  liangziStateForUpRatio,
  liangziUpRatioBand,
  type ActiveLiangziState,
  type LiangziState,
  type LiangziThresholdPolicy,
  type LiangziUpRatioBand,
} from './liangzi.ts'
export {
  EMPTY_GLOBAL_AGGREGATE,
  applyAcceptedVote,
  assertValidAggregate,
  buildPublicSnapshot,
  type GlobalVoteAggregate,
  type PublicLiangSnapshot,
  type SnapshotBuildInput,
} from './global-state.ts'
export {
  VOTE_TYPES,
  assertRequestId,
  assertVoteType,
  isRequestId,
  isVoteType,
  type RequestId,
  type VoteIntent,
  type VoteRejectionReason,
  type VoteResult,
  type VoteType,
} from './vote.ts'
export {
  assertBusinessDate,
  assertValidCase,
  isBusinessDate,
  type BusinessDate,
  type CaseStatus,
  type DailyLiangCase,
} from './case.ts'
export {
  LIANG_POSITION_DECIMALS,
  WAITING_PERCENT_TEXT,
  formatCompactCount,
  formatLiangPosition,
  formatRatioPercents,
  incensePlaceValue,
  liangQiIntensity,
  type IncensePlaceValue,
  type RatioPercentPair,
} from './presentation.ts'
