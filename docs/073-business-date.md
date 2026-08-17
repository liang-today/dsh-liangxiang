# 073 — Business Date 与日切（在线模式）

## 权威链

```text
后端服务器时钟 + LIANGBIAO_BUSINESS_TZ（默认 Asia/Shanghai）
  → business_date（YYYY-MM-DD）
  → 当日唯一 active DailyLiangCase
  → daily_incense_state 的分区键
  → 已结束日期的梁祠永久档案
```

浏览器时钟、浏览器时区、Host 时钟都**不能**决定投票资格：

- `/v1/*` 的每个请求都先 `ensureActiveCase(serverNow)`；
- Host 采纳 `/v1/bootstrap` 与 `/v1/snapshot` 返回的 `business_date`，并把它写进浏览器 wire 帧；
- Host 本地时区只用于**给本地观测的 Token 分桶**，并且上报 claim 时带 `claim_business_date`；
- 后端只接受 `claim_business_date == 服务器业务日` 的 claim，否则忽略并告警（宁可少记，绝不错记到别的一天）。

## 日切时发生什么

1. 首个跨过午夜的请求触发 `ensureActiveCase`：
   - `closeCasesBefore(today)`：昨天仍 active 的案置为 `closed`（带 `closed_at`）；
   - 将所有尚未归档、早于 today 的业务日幂等合并为日梁；同日多梁案票数与标题合并；
   - 若某 ISO 周或自然月已经完整结束，以日档原始票数求和并幂等封存永久周梁/月梁；
   - 只在确有新增档案时推进一次 `archive_version`；当前周/月暂梁不入库；
   - 插入 `case-YYYY-MM-DD`（新 id）与 `sequence=1` 的零票快照。
2. 新的一天个人状态从零开始（新的 `(installation_id, business_date)` 行）：`claimed=0 / used=0 / remaining=0`，UI 显示 `0 炷`。
3. 全网统计切到新案：0 票 ⇒ `待开梁` + `--`，昨天的 `daily_liang_stats` 留在昨天的 `case_id` 上。
4. 昨天的 `case_id` 再投票 → `case_not_active`（已关闭）；未知 id → `stale_case`。
5. Host 在 `/v1/snapshot` 发现 `business_date` 或 `active_case.id` 变了，就重新 `bootstrap`，把个人状态与新案一起换掉（不会出现新案配旧余额）。这是 Host 约 1s 拉一次公共快照，**不是** VPS→Host 的 WebSocket。香火/香客/梁案走同一条通道。
6. 同一 snapshot/bootstrap 里的标量 `archive_version` 若前进，Host 用 `/v1/history?after_version=N` 只补新增永久档案；今日仍显示「今日进行中」，当前周/月暂梁从截至昨天的日档重新派生。

## 同日运营发布（TEMP）

VPS 本机 CLI `node lib/backend-cli.js case publish "…"` 会：

1. 把今日 active 案 `closed`（旧票/统计/快照留在旧 `case_id`）；
2. 开新 id + 零票快照（待开梁 / `--`）；
3. 清当日 `used_incense`，保留 claimed Token，剩余香火可投新案。

Host 仍靠下一次 snapshot 看到新 `active_case.id`。悬停/打开面板可 force bootstrap，不必干等 ~1s。没有单独的分钟级梁案轮询。

## 测试

- `tests/backend-service.spec.ts`：日切开新案 / 旧案 closed / 个人状态归零 / 昨日聚合不泄漏 / 旧案 id 被拒 / 业务日只由服务器时钟+时区决定（UTC vs Asia/Shanghai 在 22:00 UTC 分属不同日）；同日 publish 归档+零票新案+香火 used 清零。
- `tests/backend-history.spec.ts`：日档、多案合并、零票、周/月边界、幂等封存、归档版本与增量读取。
- `tests/host-backend.spec.ts`：Host 采纳后端业务日、跨日后 wire 帧显示新案 + 归零余额 + `待开梁`，旧案投票被拒；snapshot poll / `refreshNow` 跟上运营发布。

## 未做（超出本阶段）

定时“预开次日梁案”、跨时区多业务日、日内梁位历史曲线、GitHub Pages 只读镜像。
