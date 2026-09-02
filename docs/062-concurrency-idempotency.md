# 062 — 并发与幂等

> **历史实现记录，不是当前契约。** 当前 schema v9 / 本地 KV 为进入 service 的
> accepted/rejected 业务处置保留 durable receipt，正常 rollover 不清理。现行事实见
> [`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md) 与源码测试。

## 并发模型

- **单进程单权威**：所有票权状态住在 DSH Host 进程内的 `FakeAuthoritativeLiangService`;`vote()` 从检查到提交全同步（无 await 间隙），Node 事件循环保证互斥 → 并发 HTTP/多 tab 天然无双花。
- 持久化 write-behind：排队到 storage domain 写链;失败只可能少记（响亮告警），不可能多花。
- 未来真正 Backend 的对应物：DB 事务 + 行锁/CAS（Prompt 3 设计），本文档的不变量测试原样迁移。

## 幂等模型

- 幂等键：客户端生成的 `requestId`（UUID;格式 `[A-Za-z0-9._-]{8,128}` 双端校验）。
- 记录仅在 **accepted** 时写入（`votes` 表）;重放同 payload → 返回原结果、零副作用;异 payload → `idempotency_conflict`。
- 网络不确定结果：客户端**必须**复用同一 requestId 重试（live-store 内建一次有界重试;禁止换新 id 逃逸幂等，AGENTS.md §15）。
- 有界性：`votes` 只保留当日活跃案的记录，rollover 清理（内存 + 介质）。

## 证明（测试）

| 断言 | 测试 |
|---|---|
| remaining=1、10 并发相异 requestId → accepted ≤ 1、used=1 | host-service `remaining=1 with 10 concurrent…` |
| 同 requestId 同 payload 重放 → 结果一致、恰一次扣香/计票/香客 | host-service `idempotency: same request id…` |
| 同 requestId 异方向 → conflict | host-service `idempotency conflict…` |
| 网络失败重试复用同 requestId、服务端只扣一次 | live-store `retries a failed vote once…` |
| SSE 失败有界（5 次）→ offline;手动 refresh 有界重连 | live-store `goes offline after bounded…` |
| 旧帧（低 revision）拒收 | live-store `drops stale SSE frames` |
