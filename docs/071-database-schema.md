# 071 — Database Schema v2（SQLite）

`PRAGMA user_version = 2`，DDL 见 `src/backend/schema.ts`（幂等，启动即 migrate）。
比例、`liangzi_state`、`earned/remaining/fill` **一律不入库**：它们由 `domain/` 从原始计数派生，存一份就会出现第二个真相源。

v1 → v2 只增加 `community_identity`。旧库启动时自动建表，不改既有账本。

## daily_liang_case

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | `case-YYYY-MM-DD` |
| `business_date` | TEXT | 业务日（服务器时区） |
| `title` | TEXT | 梁案标题 |
| `status` | TEXT | `active` / `closed` |
| `token_per_incense` | INTEGER >0 | 案级 Token 政策快照 |
| `liangzi_policy_version` | TEXT | 阈值策略版本（`liangzi-v0.1-60-70-80-90`） |
| `created_at` / `opened_at` / `closed_at` | INTEGER | epoch ms |

```sql
CREATE UNIQUE INDEX ux_case_one_active_per_date
  ON daily_liang_case (business_date) WHERE status = 'active';
```

**一个业务日最多一个 active 梁案由数据库保证**，不靠应用代码自律。日切时旧案 `status='closed'`。

## daily_incense_state（installation 级个人日状态）

| 列 | 类型 | 说明 |
|---|---|---|
| `installation_id` + `business_date` | TEXT, PK | 假名安装标识 × 业务日 |
| `claimed_effective_tokens` | INTEGER ≥0 | Host 观测**声明**（单调 ratchet，不可回退） |
| `used_incense` | INTEGER ≥0 | 已消费香火（唯一权威） |
| `token_per_incense` | INTEGER >0 | 该日适用政策 |
| `claim_source` | TEXT | 恒为 `host_observed_unverified`（A3） |
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

## 不存在的表（永不添加）

candidate / ranking / leaderboard / winner / 梁签(ballot) / personal avatar tier。
