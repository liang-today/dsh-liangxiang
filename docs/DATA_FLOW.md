# DATA_FLOW — 数据从哪来、被谁决定、到哪去

两条流刻意分开：一条决定**全网梁位与梁子状态**，一条决定**个人梁气**。它们只在视觉上围绕梁子相遇。

## 全局流（决定梁位 / 梁子五态）

```text
DSH 会话产生 provider-reported 用量
  → Host UsageProjection（高水位差分，按业务日分桶）        [本地观测]
  → POST /v1/token-claims  claimed_effective_tokens         [不可验证的声明]
  → daily_incense_state.claimed_effective_tokens（单调 ratchet）
  → earned = floor(claimed / token_per_incense)             [domain 派生]
  → POST /v1/votes {case_id, vote_type, request_id}         [最小意图]
  → 事务：CAS 扣香 → liang_vote → daily_liang_stats → public_liang_snapshot(sequence+1)
  → 投票响应即带回该 snapshot；GET /v1/snapshot 也读它
  → Host → SSE → 浏览器
  → UI：梁位 83.021952% + 梁子五态 + 全局香火/香客
```

## 个人流（决定梁气，不进全局链）

```text
daily_incense_state.{claimed_effective_tokens, used_incense}
  → remaining = earned - used            → 梁气旺盛程度（粒子/光晕/火苗）
  → remainder = claimed % 50,000         → 香火环 fill
  → to_next  = 50,000 - remainder        → 右翼「下一炷 X Token」
```

投票只动 `used`，不动 `remainder`：所以花香火会让梁气变弱，但**不会**把环的进度倒回去。

## 谁是权威

| 数据 | 权威 | 备注 |
|---|---|---|
| 业务日、活跃梁案 | Backend（服务器时钟 + 配置时区） | 浏览器/Host 日期无权 |
| `used_incense` / `remaining` | Backend（DB 事务 + CAS） | 唯一可花余额 |
| 幂等 | Backend（`UNIQUE(installation_id, request_id)`） | 只记 accepted |
| 全局聚合与已发布快照 | Backend | 比例与状态同一行派生 |
| 梁祠日/周/月永久档案 | Backend | 已结束业务日按原始票数幂等封存；今日不入档 |
| `claimed_effective_tokens` | **无人可验证**（Host 声明） | A3 的核心缺口 |
| 投票者身份 | **无人可验证**（假名安装标识） | A3 的核心缺口 |
| 徽章位置 | 浏览器 `localStorage` | 纯外观偏好 |

## 出网与隐私

Host 只向配置的 `LIANGXIANG_BACKEND_URL` 发启动/声明/打梁/今日快照与个人状态/梁祠历史请求：bootstrap、token-claims、votes、snapshot、daily-state、history。写载荷里只有 `case_id` / `vote_type` / `request_id` / 一个整数 token 计数 / 业务日 / 假名安装标识；history 是公共只读原始计数，不含 prompt、回复或个人账本。

**永不出网**：prompt、模型回复、文件路径、代码、会话内容、API key。详见 [`PRIVACY.md`](PRIVACY.md)。
