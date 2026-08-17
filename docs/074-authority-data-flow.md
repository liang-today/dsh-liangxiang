# 074 — Authority Data Flow（A3 / DEV_STAGING_ONLY）

## 谁说了算

```text
[DSH sessionProjections.tokenUsage]  ← 本地可读，非服务端可验证
        │ UsageProjection（高水位差分，按业务日分桶）
        ▼
[Host 本地当日 Effective Token]      ← 观测值
        │ POST /v1/token-claims  { claimed_effective_tokens, claim_business_date }
        ▼
[daily_incense_state.claimed_effective_tokens]  ← 单调 ratchet 的“声明”
        │ earned = floor(claimed / token_per_incense)          （domain 派生）
        ▼
[后端权威的 remaining_incense]        ← 唯一可花余额
        │ POST /v1/votes  { case_id, vote_type, request_id }   （最小意图）
        ▼
[原子扣香 + liang_vote + daily_liang_stats]      ← 事务
        │ cadence 发布
        ▼
[public_liang_snapshot(sequence)]     ← 比例与梁子状态同版本派生
        │ GET /v1/snapshot → Host → SSE → 浏览器
        ▼
[UI：夯% / 梁子五态 / 香火 / 香客]
```

独立的第二条流（不进入上面的权威链）：

```text
remaining_incense      → 梁气旺盛程度（presentation）
token_remainder/50K    → 香火环 fill
```

## 客户端绝不携带的字段

`/v1/votes` 的请求体**只允许** `case_id` / `vote_type` / `request_id`。出现下列任一字段直接 400（`invalid_request`，带字段路径），而不是“忽略”：

`user_id`、`installation_id`、`effective_tokens`、`claimed_effective_tokens`、`earned_incense`、`used_incense`、`remaining_incense`、`liangzi_state`、`liang_qi_fill`。

失败而非忽略是刻意的：将来若有人在客户端“顺手带上余额”，CI 会红，而不是静默进入软信任。

## 身份

- `x-liangxiang-installation`：Liangxiang **自铸**的 uuid（`inst-<uuid>`），存在 DSH storage domain 的 `identity` 表。
- **不复用** DSH 的 `.anonymous-user-id`：那是 DSH 内部值，借用它既不会变成鉴权，又会把内部标识发到网络上。
- 它是假名标识：可重置、可伪造、可复制。`unique_voters` 的真实含义是**参与过的独立安装数**，不是人数。
- 无 storage domain 时 Host 用进程内临时 id 并**大声告警**（重启即换池）。

## Token

- 口径：`Effective = (uncachedInput + cacheRead + cacheWrite) + output`（AGENTS.md §5），无 cache-read 折扣、不丢 cache-write、reasoning 已含在 output 内不重复加。
- 后端**无法**验证该数值；ratchet 只保证“不回退”，不保证“为真”。
- 因此可以说“服务端记账”，不可以说“可信用量投票”。

## 与 Phase 2 的差异

| 项 | Phase 2（LOCAL_FAKE_DEV） | Phase 3（DEV_STAGING_ONLY） |
|---|---|---|
| 余额权威 | Host 进程内 | 后端 DB |
| 幂等/并发 | Host 同步事务 | DB 事务 + UNIQUE + CAS |
| 业务日 | Host 时钟 | 后端时钟 |
| 多标签 | 同 Host 收敛 | 同 DB 收敛（可跨 Host 重启） |
| 身份 | 无（单机） | 假名 installation id |
| 诚实标注 | `本地演示模式…` | `社区软信任：…不是可信全网公投` |
