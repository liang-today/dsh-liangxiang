# 040 — DSH Authority Spike（身份 / Token / 权威性）

勘察基线：本地 `../deepseek-harness` @ `47f94385`（docs/000）。所有结论只依据本地源码；路径相对该检出。核心问题：**生产 Backend 能否在不相信前端自报数据的前提下，获得可信用户身份与可信 Token 使用量？**

## A. Current User / Auth

| # | 问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | DSH 是否存在"已认证用户"概念？ | **不存在**。全仓无 login/OAuth/账号体系;`packages/credentials` 只管理 **provider API key**（模型服务凭据），不是 harness 用户身份 | 全仓搜索 `authenticated user / oauth / login / signIn` 无 harness 用户命中;`packages/credentials/README.md` |
| 2 | 是否有第三方插件可读的 current user / user id？ | 有**匿名安装标识**：`getOrCreateAnonymousUserId()`，每个 `$DSH_HOME` 一个随机 UUID v4，持久化于 `$DSH_HOME/.anonymous-user-id` | `packages/identity/anonymous-user-id/README.md:5`、`src/index.ts`（公开共享库，非 Cordis 插件） |
| 3 | 该 identity 能否被外部 Liangxiang Backend 验证？ | **不能**。它是客户端自持的明文 UUID：任何进程可读、可复制、可伪造;无签名、无服务器侧登记、无挑战-响应 | 同上（README「never derived from … identifying source」;纯本地文件） |
| 4 | anonymous-user-id 的安全语义？ | 纯**假名相关标识**（telemetry Resource `user.id`、`/feedback` 回执、DeepSeek provider 请求头共享同一值），设计目标是关联而非认证 | README:5、:15 |
| 5 | 可否删除/重置？ | 可以：删除 `.anonymous-user-id` 下次启动重生成;不同 `$DSH_HOME` 互不关联 | README:7、:27-29 |
| 6 | 是否只能作 pseudonymous identifier？ | **是**。绝不能当 Auth 用（可零成本重置=无限新身份;可复制=身份冒用） | 综合上述 |
| 7 | DeepSeek provider 是否发送 harness user id header？ | 是：`dsh-llm-deepseek` 向其解析出的 `baseURL` 发送 `x-deepseek-harness-user-id` | `packages/llm/llm-deepseek/src/adapter.ts:288`、`src/index.ts:22` |
| 8 | 梁相 Backend 能否合法验证该 header 真实性？ | **不能**。header 只到 DeepSeek 网关;梁相 Backend 不在链路上，也无 DSH 提供的核验 API。声称"某 UUID 用了 N Token"的只能是客户端自己 | adapter.ts（header 仅注入 provider 请求）;全仓无对第三方开放的核验端点 |

**分级**：anonymous-user-id 公开（README + 导出）;credentials 公开但语义无关;"无 Auth"为否定性结论（穷举搜索）。

## B. Token Source

见 [`041-dsh-token-mapping.md`](041-dsh-token-mapping.md)。要点：唯一权威是 durable `tokenUsage` projection（provider-reported，四桶互斥，reasoning 已含于 output），本地 Host 可读;Context Occupancy 明确不可作记账输入。

## C. Server-verifiable Token Authority

搜索 remote usage API / authenticated usage ledger / signed usage receipt / signed request accounting / API-key usage query：**全部不存在**。

- 全仓无 `usage ledger / usage receipt / signed usage` 命中（否定性搜索，2026-08-16）。
- Token 数据的仅有形态：会话日志内 durable 事件（`assistant/chunk` usage / `assistant/message.usage`）与其投影 —— 均为**本地** Host 进程内数据。
- telemetry（OTel）可上报使用数据到运营侧，但那是 DSH 官方遥测通道，不对第三方 Backend 提供查询/核验 API，且可用 `DSH_TELEMETRY_DISABLED` 关闭（`anonymous-user-id/README.md:15`）。

**结论**：本地 Host 能"读到"Token ≠ 梁相云端能"验证"Token。当前 DSH 不提供任何服务器可验证的用量权威。

## D. DSH Backend/API conventions

见 [`044-dsh-current-ui-backend-conventions.md`](044-dsh-current-ui-backend-conventions.md)。

## E. Business date / timezone

- DSH 无业务日期/时区概念：`settings` 是通用偏好面（`packages/settings/settings/README.md`），无 timezone 用户设置;会话事件只有 Unix 毫秒 `time`（`packages/core/session/src/types.ts:404-436`）。
- 因此梁相自行管理：本地模式用显式可配置 dev business timezone（默认 `Asia/Shanghai`，env 覆盖）;在线模式必须以未来 Backend 的 `business_date`/server time 为准（AGENTS.md §10）。浏览器本地日期永不作为票权 authority。

## 结论 → Decision Gate A

进入 [`043-decision-gate-a.md`](043-decision-gate-a.md)：**A3**（Token 本地可观测，身份/权威均不可服务器验证）。
