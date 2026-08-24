# 061 — 投票状态机

实现：`fake-service.ts` `vote()`（同步事务） + `routes.ts`（边界校验） + `live-store.ts`（客户端意图）。

## 意图生命周期

```text
Client 点击 / 长按
  └─ requestId = crypto.randomUUID()（一次意图一个 id，重试复用）
    └─ POST /vote {caseId, voteType, requestId, count?}
       count 省略或 1 = 单击一炷；长按一把梭把剩余香火放进同一请求
       长按满 3 秒由客户端自动松开，不再空等 pointerup
       网络失败 → 等 400ms → 同 requestId 重试一次 → 仍失败 → UI「打梁失败」
  └─ Host 边界：JSON ≤4KB、parseWireVoteRequest（voteType 严格 up/down、requestId 格式、count ∈ [1,500]）
  └─ 在线：Host 原样转发 POST /v1/votes（含 count）
  └─ 服务事务（同步，无 await 间隙）：
       1. rotateToCurrentDate()（rollover 安全）
       2. caseId ≠ active → rejected(stale_case)
       3. requestId 已记录：
            同 payload → 返回原 accepted 结果（不再扣香/计票/加香客）
            异 payload → rejected(idempotency_conflict)
       4. 令牌桶 peek：每分钟回填 50，最多攒 10 分钟 = 500；新安装初始 50
          available <= 0 → HTTP 429（不是循环 500 次请求）
       5. spent = min(requested, remaining, available, 500)
          spent < 1 → rejected(insufficient_incense)
       6. commit：used+spent; 首票 unique+1; up/down+spent; 记录一行 request_id
       7. 仅 accepted 且非重放时 consume(spent)
  └─ 响应：result + 完整 state（personal 立即、global 待 cadence）
  └─ 客户端提示用 remainingBefore - remainingAfter，不依赖服务器回放 spent
```

## 结果集

`accepted{usedIncenseToday, remainingIncense}` | `rejected{reason ∈ insufficient_incense / stale_case / idempotency_conflict / case_not_active / invalid_intent}`。

## 不变量（tests/host-service.spec.ts）

- 单击 1 accepted = 1 used；一把梭 1 accepted = N used。夯/拉共池;重复/混投合法;第 6 炷拒绝。
- remaining=1 并发 10 → accepted ≤ 1（同步 check-and-commit）。
- 同 requestId 同 payload：恰一次扣香/计票/香客;重放返回一致结果。
- 同 requestId 异 payload：结构化冲突。
- rejected 不记入幂等表（原因：拒绝不消耗资源;条件变化后同意图应可重评）——冲突检测只针对已 accepted 的 requestId。
- rollover 后旧 caseId → stale_case;昨日投票记录随案清理。
