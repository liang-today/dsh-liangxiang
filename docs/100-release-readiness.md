# 100 — Release Readiness（v0.1 RC，本地）

结论先写：**Go —— 作为本地 / 团队内 staging 的 Release Candidate**。
**No-Go —— 公网部署、npm 发布、任何「可信 / verified」表述**（结构性原因见 [`075`](075-backend-decision.md)、[`101`](101-threat-model.md)）。

## RC 记录

| 项 | 值 |
|---|---|
| 梁标版本 | 0.1.0 |
| RC 产物 | `dsh-liangbiao-0.1.0.tgz`（仓库根，gitignored） |
| SHA256 | `3123a117cf0cede971488edb3015550db4229dec19f5e151f09c86ac6ba9bdc3` |
| 包内容 | `lib/index.js`、`lib/client.js`、`lib/client.js.map`、`cordis.patch.yml`、`README.md`、`LICENSE`、`package.json` |
| host entry | `lib/index.js`（ESM，`main` + bundle 行由 `cordis.patch.yml` 插入） |
| client entry | `lib/client.js`（浏览器 CJS factory，`window.__ModuleLoader__.load` 包装） |
| backend | `lib/backend.js`（**不在包内**，从仓库 `pnpm run backend:start` 运行） |
| authority mode | `DEV_STAGING_ONLY`（`VERIFIED_PRODUCTION` 启动被拒 + wire 不可表示） |
| Token Meter seam | DSH `sessionProjections` 的 `tokenUsage` 投影四桶：`uncachedInput + cacheRead + cacheWrite + output` |
| tested DSH commit | `47f943859bef60e4160492346772ded9b24f765a`（本地源码 `0.1.0-rc.5`）；npm devDeps `0.1.0-rc.6` |
| Node / pnpm | v22.17.0 / 10.33.0 |
| OS / 浏览器 | macOS 26.5.2（darwin 25.5.0）/ DSH WebUI 内置 Chromium |

## 验证结果

| 门 | 结果 |
|---|---|
| `pnpm run typecheck` | ✅ |
| `pnpm run lint`（oxlint） | ✅ |
| `pnpm test` | ✅ 20 文件 / **257 项** |
| `pnpm run build` | ✅ host 73.4 kB / backend 49.7 kB / client 278.7 kB（gzip 179 kB） |
| `pnpm pack` + 内容审计 | ✅ 仅 6 个预期文件 |
| `pnpm audit --prod` | ✅ 无已知漏洞（运行时依赖 0 个） |
| `smoke:clean-profile` | ✅ SMOKE OK（干净 profile 装 tarball → boot → banner/boot 图/host 标记） |
| `smoke:online` | ✅ 拒绝 VERIFIED_PRODUCTION、claim 折算、幂等只扣一次、50 并发只 1 票、快照发布 |
| `assert-profile-modules.mjs` | ✅ 每个 in-box 包单实例 |
| 即席并发/安全审计 60 项 | ✅ 60/60 |
| 实机：工具调用回合 | ✅ bash 工具正常，无 `prepare` 错误 |
| 实机：投票 → 梁位即时变化 | ✅ 香火 −1 与梁位变化同一次点击可见 |

## 本阶段修掉的问题

| 级别 | 问题 | 修复 |
|---|---|---|
| **High** | 干净 profile 冒烟脚本在客户端产物变大后必然失败（`curl \| head -c` 写错误 + `pipefail`）——发布验证路径本身是坏的 | 改为先落盘再取头部；重跑 SMOKE OK |
| **High** | 后端限流表按 installation id 无界增长；id 是自造的 ⇒ 攻击者可控内存增长 | 超阈值清扫过期窗口 + 回归测试（1200 个 id 洪泛） |
| **High**（环境） | dev profile 里 in-box 包被装出第二份 ⇒ `unique symbol` 失配 ⇒ 所有工具调用崩溃并污染会话 | 只留 bundle 声明、移除依赖，新增 `assert-profile-modules.mjs` 断言 + 脚本内置检查 |
| Medium | 超大请求体直接掐 socket，调用方无法区分「已拒绝」与「结果未知」 | 结构化 413 + `connection: close` + 回归测试 |
| Medium | 个人余额只在投票/claim 时刷新，带外变化（另一标签/另一 Host）不收敛 | 每 5 个 tick 回读 `/v1/me/daily-state` + E2E 测试 |
| Medium | 快照 1s 发布会让 `public_liang_snapshot` 无界增长 | 每梁案保留最新 200 条，发布时同事务裁剪 |
| Low | `assertValidCase(candidate)` 的参数名与已废弃的 Candidate 概念同形，污染语义扫描 | 重命名为 `value` 并注明原因 |

## 最终复审

**Release Blockers**：无。

**High**：无（上表三项已修并重跑）。

**Medium（未修，已记录）**：
1. 客户端产物 279 kB（gzip 179 kB），因为六态美术以 base64 内联进单文件 bundle；DSH 客户端 bundle 是单文件加载形态，改为惰性加载需要新增静态路由。本地加载可接受。
2. 跨进程并发（多个 Host 共享同一 SQLite）未压测。
3. 实测 Node 22.17.0 低于 DSH 声明的 `^22.19.0`；全部测试与实机验证在此版本通过。

**Low**：面板固定 252px 无窄屏适配；徽章位置不跨设备；梁位小数固定 6 位（票数极少时显得多余）；`node:sqlite` 实验特性告警。

**Accepted Limitations**：见 [`102`](102-known-limitations.md)。核心三条是 A3 的结构性缺口——无可验证身份、无可验证 Token、因此无法反女巫；它们决定了「不公网、不发布、不宣称可信」。

**Missing Tests**：跨进程并发压测；真实 DSH 多会话 / replay / compaction 长跑；a11y 自动化审计（axe 之类）；非 Chromium 浏览器。

**Final Go/No-Go**：
- 本地 / 团队内 staging：**Go**。
- 公网 / 生产 / 「可信全网投票」表述：**No-Go**，且由代码门禁强制（后端拒绝 `VERIFIED_PRODUCTION`）。
