# 051 — 当日 Token 聚合规则

实现：`src/host/usage-ledger.ts`（纯函数） + `src/host/fake-service.ts`（账目所有者）。持久化：storage domain `liangxiang` v1（`watermarks` / `daily_usage` 表）。

## 规则汇总

1. **数据源**：每会话累计 `tokenUsage` 投影（docs/041）;不消费 raw 事件、不 DOM 抓取、不用 Context Occupancy。
2. **水位**：`sessionId → {inputHwm, outputHwm}`;input = 三输入桶之和。水位单调（max），只在结构变化时写盘。
3. **未知会话**：catch-up 或 `firstLiveSeq > 0` → 基线化（贡献 0）;live 且 `firstLiveSeq === 0` → 从 0 计。
4. **贡献**：`delta = max(0, cumulative - hwm)`，按观测时刻的 business date 累加进 `daily_usage[date]`。
5. **派生**（domain 公式，AGENTS.md §5）：
   `effective_today = input_today + output_today`;`earned = floor(effective/50000)`;`remainder/fill/toNext` 同源。
6. **rollover**：新 business date 起新记录;旧日记录保留（诊断），不参与今日派生。
7. **方向性**：所有歧义（回落、停机窗口、compaction 摘要）一律向少计侧收敛，绝不多铸香火。

## 有界性

- `watermarks` 每会话一行、`daily_usage` 每日一行、`votes` 只保留当日案（rollover 清理）——增长有界、可预期。
- 观测无轮询：投影变更推送 + 一次启动补扫。

## 已知余项

- Host 停机期间产生、且跨越午夜的增长，会在恢复观测时计入观测日（不双计，可能晚一天）。
- 删除/退役会话的水位行残留（无副作用）;未来引入按 DSH 公开契约的清理钩子时再收紧。
