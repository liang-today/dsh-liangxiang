# DATA_FLOW — 数据从哪来、被谁决定、到哪去

两条流刻意分开：一条决定**全网梁位与梁子状态**，一条决定**个人香火环**。它们只在视觉上围绕梁子相遇。

## 全局流（决定梁位 / 梁子五态）

```text
DSH 会话产生 provider-reported 用量
  → Host UsageProjection（高水位差分，按业务日分桶）        [本地观测]
  → POST /v1/token-claims  claimed_effective_tokens         [不可验证的声明]
  → daily_incense_state.claimed_effective_tokens（单调 ratchet）
  → earned = floor(claimed / token_per_incense)             [domain 派生]
  → POST /v1/votes {case_id, vote_type, request_id, count?} [最小意图；批量仍是一次请求]
  → 事务：先查/写 liang_vote_request receipt；accepted 再 CAS 扣香 → liang_vote
           → daily_liang_stats → public_liang_snapshot(sequence+1)
  → 投票响应即带回该 snapshot；GET /v1/snapshot 也读它
  → Host → SSE → 浏览器
  → UI：梁位 83.021952% + 梁子五态 + 全局香火/香客
```

## 个人流（决定香火环，不进全局链）

```text
daily_incense_state.{claimed_effective_tokens, used_incense}
  → remaining = earned - used            → 环上香火数量与展示强度
  → remainder = claimed % 50,000         → 香火环 fill
  → to_next  = 50,000 - remainder        → 右翼「下一炷 X 当量」
```

投票只动 `used`，不动 `remainder`：所以花香火会减少环上可用香火和展示强度，
但**不会**把下一炷进度倒回去。

## 离线玩法流（用户明确选择后）

```text
DSH 累计 tokenUsage
  → 与在线共用 session watermark，只取尚未记过的 delta
  → liangxiang_local.json / daily_usage
  → 本机 earned / used / remaining
  → 本机夯拉聚合与本机快照
  → 日切写入本机日梁，再按原始票数生成本机周梁/月梁
```

在线与离线只共享防重高水位，不共享日用量、香火、投票、梁案或梁祠。断网沿在线流等待恢复；只有首次选择、梁相案牍按钮或明确启动默认值可以进入离线流。

## 谁是权威

| 数据 | 权威 | 备注 |
|---|---|---|
| 业务日、活跃梁案 | Backend（服务器时钟 + 配置时区） | 浏览器/Host 日期无权 |
| `used_incense` / `remaining` | Backend（DB 事务 + CAS） | 唯一可花余额 |
| 幂等 | Backend（`liang_vote_request` 主键 `(installation_id, request_id)`） | 进入 service 的 accepted/rejected 业务处置都留 receipt；同 payload 重放，异 payload 冲突；HTTP 400/429/网络/500 不占 ID |
| 全局聚合与已发布快照 | Backend | 比例与状态同一行派生 |
| 梁祠日/周/月永久档案 | Backend | 已结束业务日按原始票数幂等封存；今日不入档 |
| `claimed_effective_tokens` | **无人可验证**（Host 声明） | A3 的核心缺口 |
| 投票者身份 | **无人可验证**（假名安装标识） | A3 的核心缺口 |
| 徽章位置 | 浏览器 `localStorage` | 纯外观偏好 |
| 离线香火、投票、梁祠 | 本机 `liangxiang_local.json` | 只在离线模式内有效，永不上传或合并 |

## 出网与隐私

Host 只向配置的 `LIANGXIANG_BACKEND_URL` 发启动/声明/打梁/今日快照与个人状态/梁祠历史请求：bootstrap、token-claims、votes、snapshot、daily-state、history。投票业务体只有
`case_id` / `vote_type` / `request_id` / 可选整数 `count`；安装身份来自签名认证头，
不是浏览器自报票权。Token claim 只含整数当量与业务日。history 是公共只读原始计数，
不含 prompt、回复或个人账本。

**永不出网**：prompt、模型回复、文件路径、代码、会话内容、API key。详见 [`PRIVACY.md`](PRIVACY.md)。
