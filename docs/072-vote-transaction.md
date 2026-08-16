# 072 — Vote Transaction、并发与幂等

实现：`src/backend/service.ts#voteInTransaction`，包在 `store.transaction()`（`BEGIN IMMEDIATE` / `COMMIT` / 失败 `ROLLBACK`）内。

## 步骤

1. `ensureActiveCase(now)`：按服务器时钟解析业务日，必要时开新案（并关闭旧案、写入零票快照）。
2. 进入事务，按 `case_id` 取案：不存在 → `stale_case`；`status != active` → `case_not_active`；不是今天的活跃案 → `stale_case`。
3. 幂等查询 `(installation_id, request_id)`：
   - 命中且 `case_id`+`vote_type` 相同 → 返回**原业务结果**（`replayed: true`），不再扣香、不再计票、不再计香客；
   - 命中但载荷不同 → `idempotency_conflict`。
4. `ensureIncenseRow`（`INSERT … ON CONFLICT DO NOTHING`）。
5. 记录 `firstVoteForCase = !hasVotedForCase(...)`（必须在插入投票前读）。
6. **原子扣香**（唯一的余额判定点）：

```sql
UPDATE daily_incense_state
   SET used_incense = used_incense + 1, version = version + 1, updated_at = ?
 WHERE installation_id = ? AND business_date = ?
   AND (used_incense + 1) * token_per_incense <= claimed_effective_tokens
```

   `changes() == 0` ⇒ `insufficient_incense`。没有“先读后写”的窗口，因此不依赖运行时是否单线程。
7. `INSERT INTO liang_vote …`；若撞上 `UNIQUE (installation_id, request_id)`（并发同 id）→ 抛 `DuplicateRequestSignal`，事务**回滚**（撤销刚才的扣香），事务外按赢家的记录返回 `replayed: true`。
8. `daily_liang_stats` 增量：`up/down +1`，首票 `unique_voters +1`，`version +1`。
9. COMMIT。响应带 `authoritative_personal_state` 与 `snapshot_version`（**不带新的全网比例**：公共快照等 cadence）。

## 并发：remaining = 1，100 个不同 request_id

保证 `accepted <= 1`。两道防线：

- 第 6 步的条件 UPDATE（CAS + affordability 同一语句）；
- `daily_incense_state` 上的 CHECK 约束。

实测：`tests/backend-http.spec.ts` 100 并发 → 1×200 / 99×409；`scripts/smoke-online.sh` 50 并发 → `accepted=1`。

## 幂等：同 request_id

- 串行重放 → 同一结果，`used_incense` 不变（`replayed: true`）。
- 20 个并行同 id → 全部 200，最终 `used_incense = 1`。
- 同 id 不同方向 → 409 `idempotency_conflict`，账面不动。
- 幂等域是 `(installation_id, request_id)`：不同安装可用相同 id。
- 网络不确定时**必须复用同一 request_id**；`backend-client.ts` 对 POST 不做自动重试，浏览器 store 的唯一一次重试复用原 id。

## 多标签收敛

余额只存在于 DB。两个标签 → 同一 Host → 同一 installation → 同一行。
`tests/backend-http.spec.ts` 覆盖顺序消费（3 炷 → 2/1/0 → 第 4 次 409）与并发抢最后一炷（恰好 1 成功）。
`tests/host-backend.spec.ts` 覆盖两个 host 调用方并发抢最后一炷。

## 拒绝原因（wire 词汇，未新增）

`insufficient_incense` / `stale_case` / `case_not_active` / `idempotency_conflict` / `invalid_intent`。
HTTP：accepted → 200；上述业务拒绝 → 409；校验失败 → 400；缺少安装头 → 401；限流 → 429。
