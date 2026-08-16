# 103 — Test Matrix（RC）

`pnpm test`：**22 个文件 / 271 项，全绿**。逐项不变量见 [`031`](031-domain-invariants.md)、[`032`](032-p0-test-matrix.md)；本文件是 RC 视角的总账：每条冻结性质对应到哪个文件。

## 覆盖分布

| 文件 | 项数 | 覆盖面 |
|---|---|---|
| `domain-liangzi.spec.ts` | 39 | 五态阈值、区间、梁位小数与截断、显示不越阈值 |
| `backend-service.spec.ts` | 36 | claim 折算/ratchet、扣香事务、幂等、香客、日切、快照发布与保留 |
| `domain-token.spec.ts` | 20 | Effective Token 口径与边界、非法输入 |
| `domain-compact-count.spec.ts` | 5 | 两翼计数 0–999 原样、K/M/B 四舍五入、长度上限 |
| `domain-vote.spec.ts` | 20 | 仅 up/down、requestId 格式、结果判别 |
| `client-panel.spec.tsx` | 20 | 四区结构、新 Region 2、两翼 K/M 缩写、布局稳定、动效、可访问性文案 |
| `host-service.spec.ts` | 19 | 本地权威服务（LOCAL_FAKE_DEV）事务矩阵 |
| `backend-http.spec.ts` | 17 | `/v1` 路由、边界校验、并发、限流、413、限流表清扫 |
| `wire.spec.ts` | 16 | Host↔Client 帧校验、拒收非法帧 |
| `badge.spec.tsx` | 10 | 徽章图标（六态）、放置数学、存储往返、面板翻转 |
| `domain-incense.spec.ts` | 9 | 个人账务恒等式、花香不回退进度 |
| `client-store.spec.ts` | 9 | 视图状态派生、阈值穿越 |
| `host-backend.spec.ts` | 9 | Host↔Backend E2E（含即时梁位、余额收敛、日切） |
| `manifest.spec.ts` | 7 | 双清单/bundle patch/entry 形态 |
| `domain-global.spec.ts` | 5 | 聚合与快照自洽、零票 null |
| `domain-independence.spec.ts` | 5 | 个人/全局解耦双向 |
| `host-usage.spec.ts` | 5 | 水位差分（replay/restart/fork 不重复） |
| `live-store.spec.ts` | 5 | SSE/重试/离线保留、同 requestId 重试 |
| `shared.spec.ts` | 3 | 冻结文案常量 |
| `client-apply.spec.ts` | 2 | 客户端注册与卸载 |
| `host-apply.spec.ts` | 2 | Host effect/inject 装配与清理 |

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
| 多标签安全 | `backend-http`、`host-backend` |
| 网络重试安全 | `live-store`、`backend-http` |
| 服务器时钟/业务日权威 | `backend-service`（UTC vs Asia/Shanghai） |
| Token 边界 0/49,999/50,000/99,999/100,000/397,000/500,000/1M | `domain-token`、`backend-service` |
| reasoning 不重复 / 四桶口径 | `domain-token`、`host-usage`、`host-backend`（10k+20k+5k+15k=50k） |
| replay/restart 不重复 | `host-usage` |
| 五态精确边界 + 零票 WAITING | `domain-liangzi`、`domain-global` |
| 比例与状态同 snapshot version | `domain-global`、`backend-v1` 校验器、`host-backend` |
| 个人变动不改梁子 / 全局变动不改个人 | `domain-independence`、`backend-service`、`host-backend` |
| 客户端不能伪造票权 | `backend-http`（400 + 字段路径）、审计 |
| production 端点默认禁用 | `backend-http`（`VERIFIED_PRODUCTION` 拒启动）、`smoke-online.sh` |
| 四区 UI / 无个人成长行 / 梁气两变量 | `client-panel` |
| reduced-motion / 键盘 / focus / Escape / tooltip / 禁用原因 | `client-panel`、`badge`、`client-apply` |
| 资源清理（timer/listener/abort/SSE/unload） | `host-apply`、`client-apply`、`live-store`、`smoke-clean-profile.sh` |
| 请求体上限 / 结构化错误 | `backend-http`（413） |
| 限流 + 限流表有界 | `backend-http` |

## 非自动化验证（手工/脚本）

| 项 | 方式 | 结果 |
|---|---|---|
| 实机工具调用（DSH profile 模块图修复） | WebUI 真实模型回合跑 bash 工具 | 通过，无 `prepare` 错误 |
| 新 Region 2 视觉与拖拽 | 浏览器实测（CDP 读值 + 截图） | 通过（含 localStorage 往返、面板翻转） |
| 投票即时反馈 | 浏览器点「夯：升梁！」→ 梁位与香火同步变化 | 通过 |
| 干净 profile 装 tarball | `smoke:clean-profile` | SMOKE OK |
| 在线全链路 | `smoke:online` | OK（50 并发只 1 票） |
| 并发/安全即席审计 60 项 | `/tmp/liangbiao-audit.mjs`（一次性脚本） | 60/60 |
| 依赖漏洞 | `pnpm audit --prod` | 无 |
| 包内容 | `tar -tzf` | 仅 6 个预期文件 |

## 已知缺口

见 [`102`](102-known-limitations.md) 第 16–19 条：跨进程并发未压测、真实 DSH 多会话长跑未做、仅 Chromium、无 a11y 自动化审计。
