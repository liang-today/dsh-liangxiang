# 050 — 真实 DSH Token → Personal LiangQi

依据 [`041`](041-dsh-token-mapping.md) 已验证 seam;Decision Gate A = A3（[`043`](043-decision-gate-a.md)）。本阶段只把真实用量接到**个人梁气**;中央梁子仍只由（本地 fake 服务发布的）全局快照决定。

## 数据流

```text
DSH tokenUsage projection（每会话累计四桶，公开 seam）
  └─ compat/dsh/usage-observer.ts
       启动补扫 ctx.sessions.list() + snapshot()   → origin=catchup
       变更流 ctx.sessionProjections.onChanged()   → origin=live(firstLiveSeq)
  └─ compat/dsh/token-usage.ts
       isDshTokenUsageBuckets（边界校验，异常样本丢弃并告警）
       normalizeDshTokenUsage：input = uncached+cacheRead+cacheWrite;effective = input+output
  └─ host/usage-ledger.ts（纯函数）
       每会话 HWM 水位差分（详见 041 §聚合与防重）
  └─ host/fake-service.ts
       按观测时刻 business date 入账 daily_usage
       → effective_tokens_today → earned → remainder → toNext → fill
  └─ wire（GET /state、SSE）只传原始计数
  └─ client wireToViewState：derivePersonalLiangQiState 重算派生值（不变量由构造保证）
```

## 覆盖的场景（tests/host-usage.spec.ts、tests/host-service.spec.ts）

| 场景 | 处理 | 测试 |
|---|---|---|
| multiple sessions | 每会话独立水位，当日求和 | `aggregates multiple sessions` |
| replay / 投影重折 | 累计值幂等 → diff 0 | `replaying the same cumulative value` |
| DSH restart | 水位持久化于 storage domain;重启后 catch-up 值 = 水位 | `restart: a rehydrated service…` |
| reconnect / duplicate notification | 同上（累计值语义天然免疫） | 同上 |
| chunk/final replacement | token-meter 已折叠;万一累计回落，HWM 不降、恢复只计超出部分（宁少勿多） | `replacement dip cannot double count` |
| pagination / compaction | 投影覆盖完整 durable log（041）;compaction 摘要自身 usage 不计（与 token-meter 口径一致，docs/004 R-4） | — |
| new session（插件运行期间新建） | `firstLiveSeq === 0` → 从 0 全额计入 | `10k+20k+5k+15k = 1 incense` |
| resume/fork（借入历史） | `firstLiveSeq > 0` 或 catch-up → 基线化，不追溯 | `catch-up values baseline` / `resumed/forked sessions` |
| day rollover | 差分按观测时刻 business date 入账;新日从 0 开始 | `a new business date opens a fresh WAITING case` |
| deleted/retired session | 水位残留无副作用（不会再产生该会话增长）;记录为已知余项（052） | — |

**V0.1 不做 TARGET_MODEL 过滤**：全部 provider-reported 用量计入。

## Business date

`host/business-date.ts`：显式 `BusinessDateProvider`（Intl.DateTimeFormat + IANA 时区校验），默认 `Asia/Shanghai`，`LIANGBIAO_BUSINESS_TZ` 覆盖;`Clock` 抽象注入（测试用 fake clock 穿越午夜）。仓内无散落的 `new Date().toLocaleDateString()`。在线后以 Backend 的 business_date 为权威（AGENTS.md §10）。

## UI（替换 mock）

- 香火环 fill / `再 N Token` / 环内 `N 炷` 全部来自真实观测 remainder（经 fake 服务的权威账目）;
- earned 跨 50K：SSE 帧 earned 增长 → 客户端播放一次「凝香 +1 炷」;
- 中央梁子只读全局快照;个人 Token 增长不改变其状态（tests: `personal token growth alone never republishes…`）。

## Diagnostics

wire `accounting` 携带 input/output tokens、observedAt、available（仅聚合计数;绝无 prompt/响应/路径/密钥）。`businessDate`、快照 cadence 一并入帧。

## 本地 observed ≠ production authority

类型与命名分离：观测值存于 `daily_usage`（local observed），投票余额由 `FakeAuthoritativeLiangService` 派生并明确标注 `LOCAL_FAKE_DEV`;详见 [`052`](052-local-vs-authoritative-state.md)。
