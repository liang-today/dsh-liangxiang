# 030 — 梁向 V0.1 领域模型

纯 TypeScript，零依赖（无 React / DSH / Node / network / DB）。全部位于 `src/domain/`，经 `src/domain/index.ts` 具名导出。所有跨层消费（client store、后续 host 记账）只允许经由这些导出。

## 模块与概念

| 概念（Prompt 要求） | 落点 | 说明 |
|---|---|---|
| `DailyLiangCase` / `BusinessDate` / `CaseStatus` | `case.ts` | `id/businessDate/title/status/createdAt/tokenPerIncense`；status ∈ scheduled/active/closed；BusinessDate = `YYYY-MM-DD` |
| `VoteType` / `VoteIntent` / `VoteResult` / `RequestId` | `vote.ts` | 严格二元 `up/down`；intent 仅 `caseId+voteType+requestId`；requestId 格式 `[A-Za-z0-9._-]{8,128}`；VoteResult 为 accepted/rejected 判别联合 |
| `GlobalLiangState`（raw aggregate） | `global-state.ts` `GlobalVoteAggregate` | `upVotes/downVotes/uniqueVoters`，每票事务更新 |
| `PublicLiangSnapshot` | `global-state.ts` | ratios + liangziState + totalIncense + uniqueVoters + capturedAt + **sequence**，同一快照内自洽 |
| `LiangziState` / `LiangziStatePolicy` | `liangzi.ts` | `waiting + 梁工/梁总/梁神/梁圣/梁祖`；`LiangziThresholdPolicy` 四边界可配置并校验（(0,1) 内严格递增，无重叠无缺口）；`deriveLiangziState(up, down)` 纯函数 |
| `PersonalLiangQiState` | `incense.ts` | `effectiveTokensToday/tokenPerIncense/earned/used/remaining/tokenRemainder/tokensToNextIncense/liangQiFill` |
| `TokenUsageInput` / `EffectiveTokenPolicy` | `tokens.ts` | 标准化 `{inputTokens, outputTokens}`；`computeEffectiveTokens` 校验并求和；`DEFAULT_TOKEN_PER_INCENSE = 50000` |
| `IncenseAccountingPolicy` | `incense.ts` | `derivePersonalLiangQiState` / `canSpendIncense` / `spendOneIncense` |
| `liangQiIntensity` | `presentation.ts` | 表现层连续标量（sqrt 阻尼、上界 1），**不是**业务 Tier |
| 判别错误 | `errors.ts` | `DomainError` + 稳定 `code`（invalid_token_count / used_exceeds_earned / invalid_policy / insufficient_incense …） |

**未创建**（按冻结契约禁止）：Candidate、Ranking、Winner、Leaderboard、LiangScore、BallotLedger、LiangBallot、PersonalAvatarTier、PersonalGrowthTier、NextAvatarTier。

## DSH 桶映射（不在 domain 内）

DSH `tokenUsage` 四桶（uncached/cacheRead/cacheWrite/output）→ `TokenUsageInput` 的映射在 `src/compat/dsh/token-usage.ts`（`normalizeDshTokenUsage`），依据 token-meter `projection.ts:13-18 @ 47f94385`（四桶互斥、reasoning 已含于 output）。domain 不绑定 DSH 桶名。

## 关键设计决策

1. **快照一致性内建于类型**：`PublicLiangSnapshot` 由 `buildPublicSnapshot` 一次性从同一组 counts 派生 ratios 与 liangziState 并盖上 sequence，渲染层拿不到"新比例旧状态"的组合。
2. **投票扣香 = 重新派生**：`spendOneIncense` 通过 `used+1` 重新调用 `derivePersonalLiangQiState`，remainder/fill/toNext 的不变性由公式本身保证而非手工拷贝。
3. **WAITING 不进阈值策略**：零票由 `deriveLiangziState` 在策略之前短路，`LiangziThresholdPolicy` 只负责五态划分。
4. **fail-safe**：一切计数输入走 `assertCount`（非负安全整数），策略走显式校验；无效输入抛 `DomainError`，无静默兜底。
