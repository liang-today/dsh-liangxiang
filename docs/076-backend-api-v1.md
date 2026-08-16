# 076 — `/v1` API 契约

契约与双向校验器：`src/shared/backend-v1.ts`（Host 与 Backend 共用同一份定义与 parser）。
`schema_version = 1`。身份走 header `x-liangbiao-installation`（假名安装标识，见 [`074`](074-authority-data-flow.md)）。

## 通用

- 错误体：`{ "error": { "code", "message", "field?" } }`，`code ∈ invalid_request | missing_installation | invalid_signature | device_conflict | unknown_route | method_not_allowed | stale_case | case_not_active | idempotency_conflict | insufficient_incense | not_ready | internal_error`。
- 鉴权（`/health` 与 `/snapshot` 除外；`POST /v1/admin/cases` 只验社区口令、不验 installation）：
  - 默认要求 Ed25519 签名头：`x-liangbiao-installation`、`x-liangbiao-public-key`、`x-liangbiao-signature`、`x-liangbiao-timestamp`；可选 `x-liangbiao-device`（MAC 集合哈希）。
  - 若服务器设了 `LIANGBIAO_COMMUNITY_KEY`，还要带 `x-liangbiao-community-key`。
  - `LIANGBIAO_ALLOW_UNSIGNED=1` 才接受旧的「只有 installation 头」请求，仅供 localhost smoke。
- 请求体上限 4KB，超限回 **413**（`invalid_request`）并带 `connection: close`——刻意不掐 socket：被掐断的连接与网络故障无法区分，会让投票方在「已拒绝」和「结果未知」之间猜，从而错误重试。
- 请求日志只含 method/path/status/installation 前 8 字符，绝不含 prompt/回复/路径/密钥。
- 时间戳统一 epoch ms；业务日 `YYYY-MM-DD`。

## GET /v1/health

无需身份。`{ status, authority_mode, business_date }`。

## GET /v1/bootstrap

需要身份。一次拿全启动所需：

```jsonc
{
  "schema_version": 1,
  "authority_mode": "DEV_STAGING_ONLY",
  "server_time": 1786873669490,
  "business_date": "2026-08-16",
  "business_timezone": "Asia/Shanghai",
  "snapshot_refresh_seconds": 300,
  "token_policy": { "token_per_incense": 50000, "effective_token_formula": "input_plus_output" },
  "liangzi_policy": { "version": "liangzi-v0.1-20-40-60-80", "boundaries": [0.2, 0.4, 0.6, 0.8] },
  "active_case": { "id": "case-2026-08-16", "business_date": "…", "title": "…", "status": "active",
                   "created_at": 0, "token_per_incense": 50000, "liangzi_policy_version": "…" },
  "authoritative_personal_state": {
    "business_date": "2026-08-16",
    "claimed_effective_tokens": 253065,
    "claim_source": "host_observed_unverified",
    "claim_verified": false,
    "earned_incense": 5, "used_incense": 0, "remaining_incense": 5,
    "token_remainder": 3065, "tokens_to_next_incense": 46935,
    "token_per_incense": 50000, "version": 2, "updated_at": 0
  },
  "global_snapshot": {
    "case_id": "case-2026-08-16", "business_date": "2026-08-16",
    "up_votes": 1, "down_votes": 1, "total_incense": 2, "unique_voters": 1,
    "up_ratio": 0.5, "down_ratio": 0.5, "liangzi_state": "liang_gong",
    "captured_at": 0, "sequence": 3, "policy_version": "liangzi-v0.1-20-40-60-80"
  }
}
```

校验器强制的不变量（收到不合规载荷即拒收，而不是照着渲染）：

- `earned = floor(claimed / token_per_incense)`、`remaining = earned - used`、`remainder = claimed % tpi`、`to_next = tpi - remainder`；
- `claim_verified` 必须为 `false`（A3）；
- `total_incense = up+down`、`unique_voters <= total`；
- `total == 0` ⇒ `up_ratio/down_ratio` 必须为 `null`（禁止假的 50/50）；
- `liangzi_state` 必须等于用同一行计数派生的状态 —— 这就是“比例与状态同版本”跨进程的执行方式。

## POST /v1/token-claims

```jsonc
// 请求
{ "claimed_effective_tokens": 253065, "claim_business_date": "2026-08-16" }
// 响应
{ "schema_version": 1, "business_date": "…", "server_time": 0, "active_case": {…},
  "authoritative_personal_state": {…}, "claim_applied": true }
```

单调 ratchet：更小的值不生效（`claim_applied: false`）；`claim_business_date` 与服务器业务日不符则忽略。
名字里的 “claim” 是契约的一部分：这是声明，不是证明。

（早期曾按身份年龄 drip 限速 `LIANGBIAO_MAX_TOKENS_PER_MINUTE`，现已移除：真实 Token 产生速率远高于固定每分钟上限，drip 只会误伤诚实用户。防滥用改在 vote 侧限流，见下方「限流」。）

## POST /v1/votes

```jsonc
// 请求：仅这三个字段，多带权威字段一律 400
{ "case_id": "case-2026-08-16", "vote_type": "up", "request_id": "5d2d034a-…" }
// 响应（200 accepted / 409 业务拒绝）
{ "schema_version": 1,
  "result": { "status": "accepted", "request_id": "…", "vote_type": "up",
              "used_incense": 1, "remaining_incense": 4, "replayed": false },
  "authoritative_personal_state": {…},
  "snapshot_version": { "sequence": 3, "captured_at": 0 },
  "global_snapshot": { "case_id": "case-2026-08-16", "sequence": 3, "up_votes": …, "down_votes": …, "…" } }
```

- `request_id` 形如 `[A-Za-z0-9._-]{8,128}`。
- 拒绝体：`result.status = "rejected"` + `reason` + `message`。
- accepted 投票在**自己的事务里发布新快照**并随 `global_snapshot` 返回——投票者点击即看到梁位变化，不多一次往返；被拒票不发布。公共比例仍只在快照 cadence 变化（见 GET /v1/snapshot）。
- host 端对「缺 `global_snapshot` 的旧后端」有回退：严格解析失败时按 `V1VoteEnvelope` 接受缺省，并回退 `GET /v1/snapshot` 补齐；该回退取的快照可能尚未包含刚投的那一票（旧后端按 cadence 发布），是明确接受的降级。
- 校验器还会交叉检查 `result` 的计数与同一响应里的 `authoritative_personal_state` 一致。

## GET /v1/snapshot

无需身份（公共读）。`{ schema_version, server_time, business_date, active_case, global_snapshot }`。
按需发布：若原始聚合已变化且距上次发布 ≥ cadence，则先追加新 sequence 再返回。

## GET /v1/me/daily-state

需要身份。便宜的个人状态刷新：`{ schema_version, business_date, server_time, active_case, authoritative_personal_state }`。

## POST /v1/admin/cases

运营发布新梁案。**不要**带 installation 签名；只验 `x-liangbiao-community-key`（服务器未配置该口令则 401，发布口关闭）。

```jsonc
// 请求
{ "title": "测试发布：梁标是夯还是拉" }
// 响应 200
{
  "schema_version": 1,
  "business_date": "2026-08-16",
  "server_time": 0,
  "archived_case": { "id": "case-2026-08-16", "status": "closed", "title": "…", /* … */ },
  "active_case": { "id": "case-2026-08-16-a1b2c3d4", "status": "active", "title": "测试发布：梁标是夯还是拉", /* … */ },
  "global_snapshot": { "case_id": "case-2026-08-16-a1b2c3d4", "sequence": 1, "up_votes": 0, "down_votes": 0,
                       "total_incense": 0, "up_ratio": null, "down_ratio": null, "liangzi_state": "waiting", /* … */ }
}
```

语义（TEMP：同日可多次发布；任意时刻仍只有一个 active）：

1. 当前 active → `closed`（旧票 / stats / snapshot 留在旧 `case_id`）；
2. 新 id `case-YYYY-MM-DD-<8 hex>` + 零票 `sequence=1` 快照；
3. 当日所有 installation 的 `used_incense` 清零，**claimed Token 保留**，剩余香火可投新案。

标题 1–120 字符，去首尾空白，禁止控制字符。缺/错社区口令 → 401 `invalid_signature`。VPS 上的 curl 见 [`121`](121-vps-deploy.md)。

香客发现新案走现有 **1s `GET /v1/snapshot`**：响应已含 `active_case`；Host 见 `id` 变化就 re-bootstrap。这是 Host 拉公共快照，不是 VPS 往 Host 推 WebSocket。悬停/打开面板可额外 force refresh，不必干等下一秒。

## 限流

`POST /v1/votes` 按 installation 每分钟 `LIANGBIAO_VOTE_RATE_LIMIT` 次（默认 600，0 关闭），超出 429。
这是防误用/防抖，不是安全边界——没有 DSH 身份，限流可以被换密钥对绕过（设备指纹只挡住同一 MAC 集合上的第二次安装）。
