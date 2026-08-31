# 071 — Database Schema v7（SQLite）

`PRAGMA user_version = 7`，DDL 见 `src/backend/schema.ts`（幂等，启动即 migrate）。
比例、`liangzi_state`、`earned/remaining/fill` **一律不入库**：它们由 `domain/` 从原始计数派生，存一份就会出现第二个真相源。

迁移轨迹：v2 增加 `community_identity`，v3 增加 `case_queue`，v4 增加梁祠永久档案，v5 增加 `admission_ticket`，v6 增加 `starter_incense_grant` 与 `daily_incense_state.starter_tokens`，v7 给日/周/月档案补 `unique_voters` 并从 `liang_vote` 回填。旧库启动时逐级建表，不改既有投票账本。

## daily_liang_case

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | 懒开：`case-YYYY-MM-DD`；运营发布：`case-YYYY-MM-DD-<8 hex>` |
| `business_date` | TEXT | 业务日（服务器时区） |
| `title` | TEXT | 梁案标题 |
| `status` | TEXT | `active` / `closed` |
| `token_per_incense` | INTEGER >0 | 案级 Token 政策快照 |
| `liangzi_policy_version` | TEXT | 阈值策略版本（`liangzi-v0.1-20-40-60-80`） |
| `created_at` / `opened_at` / `closed_at` | INTEGER | epoch ms |

```sql
CREATE UNIQUE INDEX ux_case_one_active_per_date
  ON daily_liang_case (business_date) WHERE status = 'active';
```

**一个业务日最多一个 active 梁案由数据库保证**，不靠应用代码自律。日切或运营发布时旧案 `status='closed'`。同日可多次 archive+open（TEMP）；索引仍拒绝两个 active。

## daily_incense_state（installation 级个人日状态）

| 列 | 类型 | 说明 |
|---|---|---|
| `installation_id` + `business_date` | TEXT, PK | 假名安装标识 × 业务日 |
| `claimed_effective_tokens` | INTEGER ≥0 | Host 观测**声明**（单调 ratchet，不可回退） |
| `used_incense` | INTEGER ≥0 | 已消费香火（唯一权威） |
| `token_per_incense` | INTEGER >0 | 该日适用政策 |
| `claim_source` | TEXT | 恒为 `host_observed_unverified`（A3） |
| `starter_tokens` | INTEGER ≥0 | 见面礼折算的 Token（计入 `claimed_effective_tokens`，Host 后续声明是整本账的绝对水位） |
| `version` | INTEGER | CAS 版本，claim/spend 各 +1 |
| `created_at` / `updated_at` | INTEGER | epoch ms |

```sql
CHECK (used_incense * token_per_incense <= claimed_effective_tokens)
```

这条 CHECK 就是 `used <= earned` 的兜底：即使服务层写错，数据库也不接受超支行。

## liang_vote

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `request_id` | TEXT | 客户端生成的幂等键 |
| `installation_id` | TEXT | |
| `case_id` | TEXT FK → case | |
| `business_date` | TEXT | 便于按日审计 |
| `vote_type` | TEXT | `up` / `down`（CHECK，无第三态） |
| `used_incense_after` / `remaining_incense_after` | INTEGER | 事务提交时的账面 |
| `created_at` | INTEGER | |

```sql
UNIQUE (installation_id, request_id)
```

**只记录 accepted 投票**：被拒绝的请求不占用 `request_id`（否则一次余额不足会永久毒化该 id）。

## daily_liang_stats（原始聚合，投票事务内即时更新）

`case_id` PK、`business_date`、`up_votes`、`down_votes`、`unique_voters`、`version`、`updated_at`，
`CHECK (unique_voters <= up_votes + down_votes)`。

## public_liang_snapshot（append-only 已发布快照）

`(case_id, sequence)` PK、`business_date`、`up_votes`、`down_votes`、`unique_voters`、`policy_version`、`captured_at`。

- 新梁案创建时立即写入 `sequence = 1` 的零票快照 → 新的一天以真实序列渲染 `待开梁` + `--`，不存在“合成快照”。
- 之后仅当**原始聚合变化**且**距上次发布 ≥ cadence** 时追加新 sequence。
- 读取时由该行派生 `up_ratio/down_ratio/liangzi_state` ⇒ 三者天然同版本（AGENTS.md §12）。

## 派生公式（唯一实现在 `domain/`）

```text
earned    = floor(claimed_effective_tokens / token_per_incense)
remaining = earned - used_incense
remainder = claimed_effective_tokens % token_per_incense
fill      = remainder / token_per_incense
to_next   = token_per_incense - remainder

total = up_votes + down_votes
total == 0 → ratio = null/null, liangzi_state = WAITING
否则       → up_ratio = up/total, liangzi_state = policy(up_ratio)
```

## community_identity（v2，社区安装身份）

| 列 | 类型 | 说明 |
|---|---|---|
| `installation_id` | TEXT PK | `lk_` + Ed25519 公钥（base64url） |
| `public_key` | TEXT UNIQUE | 32 字节公钥，base64url。私钥只留 Host |
| `device_fingerprint` | TEXT UNIQUE | 本机非内部 MAC 的 SHA-256；`NULL` 可重复（无网卡的 VM 跳过绑定） |
| `created_at` / `last_seen_at` | INTEGER | epoch ms。`created_at` 是香火 drip 的计时原点 |

这不是 DSH 认证。公钥证明「还是这把私钥」；指纹只提高同一台机器反复建号的成本，MAC 可伪造，不是反女巫。

## admission_ticket（v5，入梁券）

`ticket_id` 为主键，`secret` 唯一；`max_claims / claimed_count` 保存可认领总数与已用数，
`status` 只能是 `active / exhausted / revoked / expired`，并记录创建、过期与最后认领时间。
认领在 `BEGIN IMMEDIATE` 事务中同时核销券和写入 `community_identity`；并发争抢同一张单次券最多成功一次。

## starter_incense_grant（v6，见面礼）

`(device_fingerprint, business_date)` 主键。每个设备每个业务日最多领一次 10 炷；换 installation id / 重装同日不能再领。无指纹（部分 VM）不送。赠额写入 `daily_incense_state.claimed_effective_tokens` 与 `starter_tokens`，以满足 `used * token_per_incense <= claimed`。

## case_queue（v3，运营梁案队列）

`id`、`title`、可空 `publish_on`、`sort_order`、`created_at`、可空 `consumed_at`。
日切懒开案时从尚未消费且日期适用的队列中取一条；没有可用项时按内置题库
（`CASE_BANK` / `scripts/case-bank.txt`）循环取下一题，不会出现无梁案日。

## 梁祠永久档案（v4）

### liang_archive_meta

单例行 `singleton = 1` 保存单调 `archive_version`。一次日切封存批次中的日/周/月新增行共用同一个版本；若没有新增档案则版本不变。

### liang_day_archive

| 列 | 说明 |
|---|---|
| `business_date` PK | 已结束的服务器业务日 |
| `case_count` / `case_titles_json` | 同日全部已关闭梁案数量与标题 |
| `up_votes` / `down_votes` | 同日全部梁案原始 accepted 票数之和 |
| `unique_voters` | 当日至少上过一炷的去重安装数（v7） |
| `finalized_at` / `archive_version` | 封存时间与冷通道游标 |
| `aggregation_policy_version` / `liangzi_policy_version` | 聚合与梁子阈值策略快照 |

今日绝不入表；同日多次开案只形成一个日档。零票日可以是有效档案，和缺失档案不同。

### liang_week_archive / liang_month_archive

共同保存周期 id、`start_date` / `end_date`、`covered_days`、原始夯/拉票数、`unique_voters`（期内去重安装，不是各日香客之和）、封存时间、归档版本和两项策略版本。周 id 为 ISO week（周一至周日），月 id 为 `YYYY-MM`。

- 只封存已经完整结束的周期；当前周/月暂梁不入库。
- 周/月票数由该周期日档的原始票数求和，再派生比例与梁子状态，不平均每日百分比或枚举。香客另按票表 `COUNT(DISTINCT installation_id)`。
- 主键/唯一周期范围 + 事务内 `INSERT OR IGNORE` 使重复日切幂等。
- `ix_*_archive_version` 支持 `/v1/history?after_version=N` 只读取新增不可变档案。

## 不存在的表（永不添加）

candidate / ranking / leaderboard / winner / 梁签(ballot) / personal avatar tier。
