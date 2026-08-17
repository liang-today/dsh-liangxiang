# 070 — Backend Architecture（Phase 3, localhost）

## 全链路

```text
Browser (client bundle, 仅 UI)
   │  /liangxiang/api/{state,events,vote,history}
   ▼
DSH Host plugin  (src/host)
   │  · UsageProjection：本地观测 tokenUsage → 当日 Effective Token（claim，非证明）
   │  · identity：自铸假名 installation id（storage domain `identity` 表）
   │  · BackendLiangService：缓存代理 + 上报 claim + 拉取快照
   │  HTTP /v1/{bootstrap,token-claims,votes,snapshot,history,me/daily-state,health}
   ▼
Liangxiang Backend (src/backend，独立 node 进程，127.0.0.1:4180)
   │  node:http + node:sqlite（WAL），无第三方依赖
   ▼
SQLite  (daily_liang_case / daily_incense_state / liang_vote /
          daily_liang_stats / public_liang_snapshot /
          liang_{day,week,month}_archive / liang_archive_meta)
```

浏览器不直连后端：Host 是唯一出口，也是唯一持有 installation id 的地方。

## 分层与职责

| 层 | 目录 | 职责 | 禁止 |
|---|---|---|---|
| domain | `src/domain` | 纯业务：Token→香火、梁子阈值、快照、日/周/月档案聚合与暂梁派生 | React / Node / DSH / SQL |
| shared | `src/shared` | `wire.ts`（Host↔Browser）、`backend-v1.ts`（Host↔Backend）、`history-v1.ts`（历史冷通道）、`business-date.ts` | 同上 |
| backend | `src/backend` | 权威：业务日、梁案、扣香事务、幂等、聚合、快照发布、日切归档 | 相信客户端自报的任何权威字段 |
| host | `src/host` | 观测 Token、假名身份、浏览器通道、两种 authority 模式装配、历史 last-known-good 缓存 | 自己算今日全局比例、自己判定业务日 |
| client | `src/client` | 今日展示 + 只读梁祠；历史独立 store | 任何账本 |

## 两种 authority 模式（同一套路由）

| `LIANGXIANG_BACKEND_URL` | 服务实现 | wire `authorityMode` |
|---|---|---|
| 未设置 | `FakeAuthoritativeLiangService`（进程内） | `LOCAL_FAKE_DEV` |
| 设置 | `BackendLiangService`（后端为权威） | `DEV_STAGING_ONLY` |

`src/host/service.ts` 的 `LiangHostService` 是两者的公共接口，`routes.ts` 只面向它编程——所以在线化没有改动浏览器 wire，UI 代码零改动。

## 请求时序（在线模式）

```text
启动          Host → GET  /v1/bootstrap        ← policy + case + personal + snapshot
观测到 Token   Host → POST /v1/token-claims     ← 单调 ratchet（debounce 1s 合并）
用户投票      Host → POST /v1/votes            ← {case_id, vote_type, request_id}
                    ← result + authoritative_personal_state + global_snapshot（accepted 票事务内发布）
快照 cadence   Host → GET  /v1/snapshot         ← 已发布的 PublicLiangSnapshot
业务日切换    /v1/snapshot 的 business_date 变化 → Host 自动重新 bootstrap
历史首次      Host → GET  /v1/history          ← 全量不可变日/周/月档案
档案版本变化  Host → GET  /v1/history?after_version=N ← 仅新增不可变行
```

个人余额随投票**立即**变化；accepted 投票在**自己的事务内发布新快照**并随响应带回，投票者点击即看到梁位变化；其余情况（被拒票、无票期间）全局比例与梁子状态只在快照 cadence 变化。无论哪条路径，比例与状态永远来自同一 sequence，Host 不会在本地伪造新的全网比例。

cadence 默认 **1 秒**（近实时）：Host 按 cadence 轮询 `/v1/snapshot` 以覆盖带外变化；投票者点击那一下的梁位变化已由投票响应里的 `global_snapshot` 直接给出，无需多一次往返。为避免 1s 节奏把 `public_liang_snapshot` 撑爆，发布时同事务内按 `SNAPSHOT_HISTORY_LIMIT`（200）裁剪历史——只有最新一行会被读取。

个人余额也可能被**带外**改动（另一个标签、另一台 Host、别处提交的 claim），所以 Host 每 5 个 tick（≈5s）额外拉一次 `/v1/me/daily-state`，否则面板会一直显示旧的香火数——那与「多标签收敛」正好相反。

## 梁祠冷通道

日切入口先在一个事务中关闭过期 active 案，并封存所有尚未归档的已结束业务日；同一日期的多梁案合为一个日档。若周一至周日或自然月已经完整结束，再由日档票数和生成永久周/月档。当前周/月只在 Host/Client 用“截至昨天”的日档即时派生，不入 SQLite。

`bootstrap` 与 `snapshot` 只带单调标量 `archive_version`。Host 首次读取完整 `/v1/history`，版本变大时再传 `after_version` 拉增量；浏览器同样走独立 `/liangxiang/api/history`。因此 1 秒 SSE 只推今天，不会反复发送历史数组。多个浏览器标签共享 Host 的上游缓存，而不是各自直连社区后端。

## 失败姿态

- 后端不可达：Host 保留最近一次成功状态，浏览器照常渲染（SSE 帧继续发），投票返回 502 并提示“用同一 requestId 重试”。
- 投票只在调用方（浏览器 store）做一次有界重试，且**复用同一 `request_id`**；`backend-client.ts` 自身对写请求不重试。
- 读请求（bootstrap / snapshot / daily-state / history）允许一次有界重试。
- history 失败只把冷缓存标为 `档案未更新`，保留 last-known-good；今日 case、香火和投票继续工作。
- `dispose()` abort 所有在途请求、清 timer、清订阅：插件卸载 / HMR 不留资源。

## 运行

```bash
pnpm run build
LIANGXIANG_BACKEND_DB=.liangxiang-backend/dev.sqlite pnpm run backend:start   # :4180
LIANGXIANG_BACKEND_URL=http://127.0.0.1:4180 pnpm run dev:web                # DSH WebUI
pnpm run smoke:online                                                       # 全链路自检
```

## 依赖与不做的事

- 零新增运行时依赖：`node:http`、`node:sqlite`（Node 22 实验特性，启动时有 ExperimentalWarning）。
- 不部署远端、不发布、不做鉴权网关/多租户/水平扩展：本阶段只要求 localhost 正确。
- 不改 `../deepseek-harness`。
