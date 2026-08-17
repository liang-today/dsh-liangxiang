# 031 — 领域不变量（V0.1 冻结）

每条不变量给出：语义、落点、验证测试。违反任意一条即偏离梁标 V0.1。

## I1 — 投票严格二元

`VoteType ∈ {up, down}`；`稳/neutral/steady/abstain` 等一律 `invalid_vote_type`。
落点 `vote.ts`；测试 `domain-vote.spec.ts`。

## I2 — Effective Token = Input + Output

`computeEffectiveTokens({input, output}) = input + output`，两者均为非负安全整数；溢出报错。DSH 三个输入桶（uncached/cacheRead/cacheWrite）全额计入 Input，reasoning 不重复计。
落点 `tokens.ts` + `compat/dsh/token-usage.ts`；测试 `domain-token.spec.ts`。

## I3 — 50K = 1 炷（精确 floor/mod 边界）

`earned = floor(effective / tokenPerIncense)`；`remainder = effective % tokenPerIncense`；`fill = remainder / tokenPerIncense`；`toNext = tokenPerIncense - remainder`。`remainder = 0` 时 `fill = 0`、`toNext = tokenPerIncense`（不显示"再 0 Token"）。
落点 `incense.ts`；测试 `domain-token.spec.ts`（0/49,999/50,000/99,999/100,000/397,000/500,000/1M）。

## I4 — 个人香火池共享且非负

`used = accepted_up_by_me + accepted_down_by_me`；`0 <= used <= earned`；`remaining = earned - used >= 0`；夯/拉共用同一 remaining。
落点 `incense.ts`（`used_exceeds_earned` fail-safe）；测试 `domain-incense.spec.ts`。

## I5 — 扣香不回退环进度

`spendOneIncense` 只改变 `used/remaining`；`effectiveTokensToday/tokenRemainder/liangQiFill/tokensToNextIncense` 逐位不变。梁气 intensity（表现层）可因 remaining 下降而变弱。
测试 `domain-incense.spec.ts`、`client-store.spec.ts`。

## I6 — 零票即待开梁

`up=0 && down=0` ⇒ `upRatio = downRatio = null`，`liangziState = waiting`；UI 显示 `--`；不伪造 50/50、无 Bayesian prior。
落点 `liangzi.ts`/`global-state.ts`；测试 `domain-liangzi.spec.ts`、`domain-global.spec.ts`、`client-panel.spec.tsx`。

## I7 — 五态只由全网夯率决定，边界精确

`<50% 梁工；[50,70) 梁总；[70,85) 梁神；[85,95) 梁圣；>=95% 梁祖`。阈值策略可配置且必须通过校验：四个边界、(0,1) 内、严格递增（无重叠无缺口）。
测试 `domain-liangzi.spec.ts`（49.999/50/69.999/70/84.999/85/94.999/95/100%）。

## I8 — 个人状态不选择梁子状态

`deriveLiangziState` 的输入只有全局票数；`PersonalLiangQiState` 的任何字段变化（remaining 0↔100、fill 0↔99%、Token +500K）不改变同一全局快照的 liangziState。
测试 `domain-independence.spec.ts`、`client-store.spec.ts`。

## I9 — 全局快照变化不移动个人梁气

同一 personal state 下，全局 55%→95% 变化不改变 remaining/remainder/fill。
测试 `domain-independence.spec.ts`。

## I10 — accepted vote 只能经全局比例间接改变梁子状态

一票使 up_ratio 从 84.2105% 跨到 85%（16/3 → 17/3），状态梁神→梁圣；同时投票者个人 remaining -1、fill 不变。状态变化原因是比例，不是个人库存。
测试 `domain-independence.spec.ts`、`client-store.spec.ts`。

## I11 — 快照自洽（同版本）

`PublicLiangSnapshot` 的 `upRatio/downRatio/liangziState` 由同一组 `upVotes/downVotes` 一次性派生并共享一个 `sequence`；渲染层必须整体消费快照。
落点 `global-state.ts`；测试 `domain-global.spec.ts`。

## I12 — 幂等词汇

每个投票意图必须携带 `requestId`（`[A-Za-z0-9._-]{8,128}`）；幂等执行语义（同 payload 同结果 / 冲突拒绝 / 不重复扣香）由权威服务层实现（下一里程碑），domain 提供词汇与校验。
落点 `vote.ts`；测试 `domain-vote.spec.ts`。

## I13 — 香火/香客定义

`totalIncense = upVotes + downVotes`（只计 accepted）；`uniqueVoters` 只在用户首次 accepted vote 时 +1，且 `uniqueVoters <= totalIncense`。
落点 `global-state.ts`；测试 `domain-global.spec.ts`、`client-store.spec.ts`。

## I14 — fail-safe

negative / NaN / Infinity / 非整数 / 溢出 / used>earned / 非法阈值 / 非法快照输入一律抛 `DomainError`（稳定 code），不静默纠正。
测试：各 domain spec 的 invalid 段。
