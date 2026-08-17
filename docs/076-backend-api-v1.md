# 076 — `/v1` API 契约

契约与双向校验器：`src/shared/backend-v1.ts`（Host 与 Backend 共用同一份定义与 parser）。
`schema_version = 1`。身份走 header `x-liangbiao-installation`（假名安装标识，见 [`074`](074-authority-data-flow.md)）。

## 通用

- 错误体：`{ "error": { "code", "message", "field?" } }`，含 `identity_rate_limited`、`rekey_cooldown`、`device_conflict` 等（见 `V1_ERROR_CODES`）。
- 鉴权（公共只读的 `/health`、`/snapshot`、`/history` 除外）：
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
  "snapshot_refresh_seconds": 1,
  "archive_version": 12,
  "token_policy": { "token_per_incense": 50000, "effective_token_formula": "input_plus_output" },
  "liangzi_policy": { "version": "liangzi-v0.1-50-70-85-95", "boundaries": [0.5, 0.7, 0.85, 0.95] },
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
    "captured_at": 0, "sequence": 3, "policy_version": "liangzi-v0.1-50-70-85-95"
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

无需身份（公共读）。`{ schema_version, server_time, business_date, archive_version, active_case, global_snapshot }`。
按需发布：若原始聚合已变化且距上次发布 ≥ cadence，则先追加新 sequence 再返回。

`archive_version` 只是单调冷数据信号；响应中绝不携带历史数组。旧后端缺该字段时 Host 兼容为 0。

## GET /v1/history

无需身份（公共只读）。梁祠使用与秒级 snapshot 分离的冷通道：

```jsonc
// 首次：GET /v1/history
{
  "schema_version": 1,
  "archive_schema_version": 1,
  "archive_version": 12,
  "business_date": "2026-08-17",
  "business_timezone": "Asia/Shanghai",
  "full": true,
  "stale": false,
  "days": [{
    "business_date": "2026-08-16",
    "case_count": 2,
    "case_titles": ["早梁案", "晚梁案"],
    "up_votes": 8,
    "down_votes": 4,
    "finalized_at": 1786873669490,
    "archive_version": 12,
    "aggregation_policy_version": "liang-archive-v1-weighted-counts",
    "liangzi_policy_version": "liangzi-v0.1-50-70-85-95"
  }],
  "weeks": [],
  "months": []
}

// 后续：GET /v1/history?after_version=12
// 同一 envelope，full=false，数组只含版本更大的不可变新增行。
```

- `after_version` 只能出现一次，必须是非负 safe integer；未知 query 参数拒绝。
- 日/周/月只传原始票数和策略版本，比例与梁子状态由共享 parser 在严格校验后派生。
- parser 拒绝负数、NaN/Infinity、非真实日期、错误 ISO 周/月边界、重复主键、标题数与案数不符、未知策略版本或行版本超过 envelope 版本。
- Host 缓存首次全量并合并后续 delta；若后端失败，保留 last-known-good、设置 `stale=true`，不影响今日链路。
- 浏览器只向本机 Host 的 `/liangbiao/api/history` 请求同形状数据；当前周/月暂梁由共享纯函数从日档推导，不在该 API 中持久化。

## GET /v1/me/daily-state

需要身份。便宜的个人状态刷新：`{ schema_version, business_date, server_time, active_case, authoritative_personal_state }`。

## 运营梁案（CLI only，无 HTTP）

运营发布不走 HTTP。在放 SQLite 的 VPS 上：

```bash
node lib/backend-cli.js case publish "测试发布：梁向是夯还是拉"
```

`POST /v1/admin/cases` 已关闭（404）。语义仍是：归档当前 active、开新零票案、清当日 used incense。详见 [`122`](122-identity-recovery.md)、[`121`](121-vps-deploy.md)。

## 限流

`POST /v1/votes` 按 installation 每分钟 `LIANGBIAO_VOTE_RATE_LIMIT` 次（默认 600，0 关闭），超出 429。
这是防误用/防抖，不是安全边界——没有 DSH 身份，限流可以被换密钥对绕过（设备指纹只挡住同一 MAC 集合上的第二次安装）。
