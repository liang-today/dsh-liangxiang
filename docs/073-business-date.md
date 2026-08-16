# 073 — Business Date 与日切（在线模式）

## 权威链

```text
后端服务器时钟 + LIANGBIAO_BUSINESS_TZ（默认 Asia/Shanghai）
  → business_date（YYYY-MM-DD）
  → 当日唯一 active DailyLiangCase
  → daily_incense_state 的分区键
```

浏览器时钟、浏览器时区、Host 时钟都**不能**决定投票资格：

- `/v1/*` 的每个请求都先 `ensureActiveCase(serverNow)`；
- Host 采纳 `/v1/bootstrap` 与 `/v1/snapshot` 返回的 `business_date`，并把它写进浏览器 wire 帧；
- Host 本地时区只用于**给本地观测的 Token 分桶**，并且上报 claim 时带 `claim_business_date`；
- 后端只接受 `claim_business_date == 服务器业务日` 的 claim，否则忽略并告警（宁可少记，绝不错记到别的一天）。

## 日切时发生什么

1. 首个跨过午夜的请求触发 `ensureActiveCase`：
   - `closeCasesBefore(today)`：昨天仍 active 的案置为 `closed`（带 `closed_at`）；
   - 插入 `case-YYYY-MM-DD`（新 id）与 `sequence=1` 的零票快照。
2. 新的一天个人状态从零开始（新的 `(installation_id, business_date)` 行）：`claimed=0 / used=0 / remaining=0`，UI 显示 `0 炷`。
3. 全网统计切到新案：0 票 ⇒ `待开梁` + `--`，昨天的 `daily_liang_stats` 留在昨天的 `case_id` 上。
4. 昨天的 `case_id` 再投票 → `case_not_active`（已关闭）；未知 id → `stale_case`。
5. Host 在 `/v1/snapshot` 发现 `business_date` 或 `active_case.id` 变了，就重新 `bootstrap`，把个人状态与新案一起换掉（不会出现新案配旧余额）。

## 测试

- `tests/backend-service.spec.ts`：日切开新案 / 旧案 closed / 个人状态归零 / 昨日聚合不泄漏 / 旧案 id 被拒 / 业务日只由服务器时钟+时区决定（UTC vs Asia/Shanghai 在 22:00 UTC 分属不同日）。
- `tests/host-backend.spec.ts`：Host 采纳后端业务日、跨日后 wire 帧显示新案 + 归零余额 + `待开梁`，旧案投票被拒。

## 未做（超出本阶段）

定时“预开次日梁案”、跨时区多业务日、历史归档查询接口。
