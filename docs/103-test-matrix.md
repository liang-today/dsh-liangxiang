# 103 — Test Matrix（RC）

`pnpm test`：**41 个文件 / 497 项，全绿**（2026-08-24，v0.8.16-beta）。逐项不变量见 [`031`](031-domain-invariants.md)、[`032`](032-p0-test-matrix.md)；本文件是 RC 视角的总账：每条冻结性质对应到哪个文件。

## 覆盖分布

| 分组 | 文件 | 覆盖面 |
|---|---|---|
| 梁祠领域/wire | `domain-archive`、`history-v1` | Gregorian 日期、ISO 周/月边界、票数加权、今日排除、暂梁、零票；严格历史解析与 delta 合并 |
| 梁祠后端 | `backend-history`、`backend-http` | 同日多案合并、日/周/月幂等封存、版本增量、零票档、`/v1/history` query 校验 |
| 梁祠 Host/client | `host-backend`、`live-store`、`client-panel`、`client-liangci-calendar` | 上游全量→增量、last-known-good stale、SSE 无历史数组、第四区入口、4/5/6 周月历与 UI 契约 |
| 领域核心 | `domain-token`、`domain-incense`、`domain-incense-weight`、`domain-vote`、`vote-budget`、`local-epithet`、`domain-global`、`domain-liangzi`、`domain-independence`、`domain-compact-count` | Token/香火/投票/令牌桶/本机梁号/梁位/五态/个人与全局隔离 |
| 后端与安全 | `backend-service`、`backend-client`、`backend-http`、`community-auth`、`identity-recovery`、`operator-identity` | 事务、幂等、并发、签名、身份恢复、运营边界、错误契约 |
| Host | `host-service`、`host-backend`、`host-usage`、`host-dev-credit`、`host-apply` | 两种权威模式、用量水位、后端集成、生命周期 |
| Client | `client-store`、`client-panel`、`badge`、`live-store`、`throttle-fill`、`client-apply` | 状态派生、四区、拖拽、动效、请求重试、注册与清理 |
| 契约/打包 | `wire`、`shared`、`manifest` | Host↔Browser fail-closed、冻结文案、双清单与版本一致性 |

## PROMPT 4 逐条对照

| 审计项 | 证据 |
|---|---|
| 1 票 = 1 炷 | `domain-incense`、`backend-service`、`host-service` |
| 重复夯 / 重复拉 / 混投 | `backend-service`（5 炷全花，第 6 次拒）、`host-service` |
| remaining=1 并发 100 ⇒ ≤1 | `backend-http`（100）、即席审计（200）、`smoke-online.sh`（50） |
| 同 request_id 重放 ⇒ 只扣一次 | `backend-service`、`backend-http`（20 并发）、审计（50 并发） |
| 同 request_id 异载荷 ⇒ 拒 | `backend-service`、`backend-http` |
| 首票才 +1 香客 | `backend-service` |
| 旧梁案被拒 | `backend-service`、`host-backend` |
| 午夜日切安全 | `backend-service`、`host-backend` |
| 日梁封存 + 同日多案合并 + 重复日切幂等 | `backend-history` |
| 周/月按原始票数加权；今日不参加暂梁 | `domain-archive`、`backend-history` |
| 零票档 / 无档 / 未来 / 今日语义分离 | `domain-archive`、`backend-history`、梁祠实机 |
| 历史首次全量，版本变化后只取 delta | `history-v1`、`host-backend`、`live-store` |
| 历史失败保留 last-known-good，不中断今日 | `live-store`、`host-backend` |
| 今日 SSE 只带 archiveVersion 标量 | `wire`、`live-store` |
| 多标签安全 | `backend-http`、`host-backend` |
| 网络重试安全 | `live-store`、`backend-http` |
| 断网不切本地、自动重连、离线继续观察凝香 | `host-backend`、`live-store`、`client-panel`、`operator-identity` |
| 手动模式选择、独立离线账本/梁祠、共享水位防双凝 | `storage`、`host-service`、`host-routes`、`live-store`、`client-panel` |
| 服务器时钟/业务日权威 | `backend-service`（UTC vs Asia/Shanghai） |
| Token 边界 0/49,999/50,000/99,999/100,000/397,000/500,000/1M | `domain-token`、`backend-service` |
| reasoning 不重复 / 四桶口径 | `domain-token`、`host-usage`、`host-backend`（10k+20k+5k+15k=50k） |
| replay/restart 不重复 | `host-usage` |
| 五态精确边界 + 零票 WAITING | `domain-liangzi`、`domain-global` |
| 梁位六位小数大基数精确截断 | `domain-liangzi` |
| 比例与状态同 snapshot version | `domain-global`、`backend-v1` 校验器、`host-backend` |
| 个人变动不改梁子 / 全局变动不改个人 | `domain-independence`、`backend-service`、`host-backend` |
| 客户端不能伪造票权 | `backend-http`（400 + 字段路径）、审计 |
| production 端点默认禁用 | `backend-http`（`VERIFIED_PRODUCTION` 拒启动）、`smoke-online.sh` |
| 四区 UI / 无个人成长行 / 梁气两变量 | `client-panel` |
| reduced-motion / 键盘 / focus / Escape / tooltip / 禁用原因 | `client-panel`、`badge`、`client-apply` |
| 资源清理（timer/listener/abort/SSE/unload） | `host-apply`、`client-apply`、`live-store`、`smoke-clean-profile.sh` |
| 请求体上限 / 结构化错误 | `backend-http`（413） |
| 限流 + 限流表有界 | `backend-http`、`vote-rate-limit`（12,000 个一次性标识，活跃 key 始终 ≤ 硬上限） |
| 品牌升级不换身份 | `storage-migration`、`badge`、`shared`（存储域、偏好、环境变量单次兼容） |

## 非自动化验证（手工/脚本）

| 项 | 方式 | 结果 |
|---|---|---|
| 实机工具调用（DSH profile 模块图修复） | WebUI 真实模型回合跑 bash 工具 | 通过，无 `prepare` 错误 |
| 新 Region 2 视觉与拖拽 | 浏览器实测（CDP 读值 + 截图） | 通过（含 localStorage 往返、面板翻转） |
| 投票即时反馈 | 浏览器点「夯 · 升梁」→ 梁位与香火同步变化 | 通过 |
| 梁祠桌面月历 | 本地种入 8 月日/周/月档，逐格核对六态、暂梁与原始票数 | 通过 |
| 梁祠窄屏与键盘 | 720×800；横向月历、Tab/Shift+Tab trap、Escape + 焦点归还 | 通过 |
| 干净 profile 装 tarball | `smoke:clean-profile` | SMOKE OK |
| 在线全链路 | `smoke:online` | OK（50 并发只 1 票） |
| 并发/安全即席审计 60 项 | `/tmp/liangxiang-audit.mjs`（一次性脚本） | 60/60 |
| 依赖漏洞 | `pnpm audit --prod` | 无 |
| 包内容 | `tar -tzf` | 仅 7 个预期文件（含 npm 自动加入的 `package.json`、README、LICENSE） |

## 已知缺口

见 [`102`](102-known-limitations.md) 第 17–20 条：跨进程并发未压测、真实 DSH 多会话长跑未做、仅 Chromium、无 a11y 自动化审计。
