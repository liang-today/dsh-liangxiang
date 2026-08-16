# 041 — DSH Token 映射（已验证 seam）

基线 `47f94385`。本文是梁标真实 Token 集成唯一允许使用的 seam 记录;实现落点 `src/compat/dsh/`。

## 权威数据源

**durable `tokenUsage` session projection**（`@deepseek-ai/dsh-token-meter`）：

```ts
// packages/llm/token-meter/src/projection.ts:13-18（公开导出 + JSDoc）
interface TokenUsageProjection {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}
```

已验证事实（源码级）：

| 事实 | 证据 |
|---|---|
| 四桶**互斥**（disjoint） | projection.ts:10-12 JSDoc「The four buckets are disjoint」 |
| **reasoning 已含于 `outputTokens`**，不再单列 | projection.ts:10-12「reasoning tokens are already included in outputTokens and are not accumulated again」 |
| provider `inputTokens`（仅未命中缓存）→ `uncachedInputTokens` | usage-projection.ts:31-36 `bucketsFrom` |
| **chunk/final 替换去重**：同 `(turn, step)` 后样本替换前样本（`addReplacing`），不累加;依赖"后一 step 报过 usage 后合法日志不会再报早先 step"不变量 | usage-projection.ts:44-53、:97-137（JSDoc + `last` 单槽） |
| 投影覆盖**完整 durable log**，跨 pagination/compaction/replay 保持累计语义;重折幂等 | projection.ts:8、`packages/session/session-projection/src/index.ts:155-169`（懒折全量日志） |
| Context Occupancy（`contextPressure`/`contextBreakdown`）是 UI 参考/启发式，**禁作记账输入** | projection.ts:20-66 JSDoc「not a billing or gating input」 |

## V0.1 冻结映射

```text
input     = uncachedInputTokens + cacheReadTokens + cacheWriteTokens   （三桶全额）
effective = input + outputTokens
```

实现：`src/compat/dsh/token-usage.ts` `normalizeDshTokenUsage`。禁止：cacheRead×0.1、丢弃 cacheWrite、reasoning 重复计、Context Occupancy、UI 抓取。

本地攒香速率（不是过滤）：对每次 HWM **增量**按会话当前精确路由 ID 加权（`requestHeader().config.model`，docs/001 Q11）：`deepseek-v4-pro` = 1，`deepseek-v4-flash` = 0.5，缺省/未知 = 1。计入当日账本的是 Pro 当量 Token；1 炷仍是 50,000 当量。服务器仍收 `claimed_effective_tokens`，不收模型名。

## 消费通道

`ctx.sessionProjections`（`@deepseek-ai/dsh-session-projection`，公开能力 seam，web 组合默认挂载）：

- `onChanged(listener)`：每次已提交事件导致某投影值变化时回调 `(session, key, value, seq)`;`value` 是 schema 校验后的 view 输出（即四桶）。注册是调用方 fiber 上的 effect，卸载自动回收。`packages/session/session-projection/src/index.ts:76-86、230-238`。
- `snapshot(session)`：对单会话全部注册投影的一致读（`{asOfSeq, values}`，同步）。index.ts:240-255。
- `ctx.sessions.list()`：live 会话枚举（`packages/core/session/src/index.ts:1050-1065`，docs/001-Q7），用于启动时基线化补扫。

## 聚合与防重（梁标侧规则）

投影值是**每会话累计值**。梁标 Host 维护每会话高水位（HWM）差分账本：

1. **水位**：`sessionId → { inputHwm, outputHwm }`（input = 三桶之和）。
2. **未知会话规则**（防追溯 + 不吞新会话首笔）：
   - 启动补扫（catch-up 枚举）见到的会话 → **基线化**：记 HWM=当前累计，贡献 0（不追溯）。
   - 变更流上首次出现且 `session.firstLiveSeq === 0`（无 seed 的全新会话，`packages/core/session/src/index.ts:450-472,539`）→ 从 0 记水位，全额计入（其全部用量都发生在观测之下）。
   - 变更流上首次出现且 `firstLiveSeq > 0`（resume/fork，前缀是借入历史）→ **基线化**（父前缀/旧历史不双计、不追溯;docs/001-Q12）。
3. **差分**：新值 > HWM 部分计入"观测时"所属 business date 的当日聚合;HWM 单调抬升（`max`）。
4. **chunk/final 替换可能使累计瞬时回落**：回落不产生负贡献，HWM 不降;回升只计超出旧 HWM 的部分 → 方向性安全（宁少勿多）。
5. **replay/restart 幂等**：重启后投影懒折全量日志得到相同累计值 = HWM，diff 0;水位持久化于 storage domain，跨重启有效。
6. **多会话**：每会话独立水位，当日贡献求和。
7. **day rollover**：差分按观测时刻的 business date 入账;跨日会话的后续增长自然归新日。

已知少计缝隙（接受，与 token-meter 口径一致）：compaction 摘要调用自身 usage 不进 `tokenUsage` 折叠（docs/004 R-4）;Host 停机期间的增长在下次观测时按观测日入账（跨午夜停机会把停机期增长记入新日——方向安全，不双计）。

## P0 验证 fixture

`uncached=10k, cacheRead=20k, cacheWrite=5k, output=15k → input=35k, effective=50k, earned=1`（tests/domain-token.spec.ts + tests/host-usage.spec.ts）。
