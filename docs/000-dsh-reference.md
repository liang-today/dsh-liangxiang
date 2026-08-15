# 000 — DSH 参考版本基线

本文档钉住本次集成勘察所依据的 DeepSeek Harness(下称 DSH)源码版本。`docs/001`–`004` 中所有源码路径、行号与 symbol 均以本基线为准;DSH 升级后必须按本文档末尾的"重勘察触发条件"重新核对。

DSH 源码检出位置(相对本仓库根):`../deepseek-harness`。本仓库任何开发活动不得修改该检出。

## 版本基线

| 项 | 值 | 采集方式 |
|---|---|---|
| git commit | `47f943859bef60e4160492346772ded9b24f765a` | `git log -1` |
| commit 时间 / 标题 | 2026-08-13 19:38:46 +0800,Merge PR #2519 `feat/npm-public` | `git log -1` |
| 分支 | `master` | `git branch --show-current` |
| 工作区状态 | 干净(`git status --porcelain` 输出为空) | `git status` |
| tag | 无(`git describe --tags` 无输出;预发布阶段) | `git describe` |
| remote | `https://github.com/deepseek-ai/deepseek-harness` | `git remote -v` |
| DSH 版本(root `package.json`) | `0.1.0-rc.5`(`@deepseek-ai/dsh-root`) | `package.json:3` |
| Node 要求 | `^22.19.0 \|\| >=24.0.0`(CI 覆盖 22.19 / 24 / 26) | `package.json:9`,`docs/development.md` |
| pnpm 要求 | `pnpm@11.7.0`(Corepack 钉定) | `package.json:7` |

同版本核对(均为 `0.1.0-rc.5`):`apps/cli`(`@deepseek-ai/dsh`)、`apps/web`(`@deepseek-ai/dsh-web-frontend`)、`packages/bundle/base`(`@deepseek-ai/dsh-base`)、`packages/bundle/web-app`(`@deepseek-ai/dsh-web-app`)。

## 预发布警示

DSH 根 `AGENTS.md` § "Pre-release stance: foundation over blast radius" 明文:首个 tagged release 之前**没有任何兼容承诺**——自由重命名/重打包、后端拒绝旧盘上格式、`SESSION_FORMAT_VERSION` 钉在 `0` 且无兼容保证。对梁标的含义:所有 DSH 触点都可能在无告警的情况下破坏,必须全部隔离在 `compat/dsh` 层并按 `docs/003` 的矩阵逐项监控。

## API 分级定义

`docs/001`–`003` 对每个 DSH 结论使用以下三级:

- **公开(public documented)**:在 `docs/`、包 README 或导出 JSDoc(受 `verify-export-jsdoc` 门禁)中有正式文档的导出 API/清单字段/事件。首选依赖对象。
- **半公开(semi-public)**:有导出或稳定行为、但仅在工程内约定(agent notes、树内 preset、生成目录)中成文,或消费面本身面向树内。允许依赖,但必须在 `docs/003` 标注并给出破坏征兆与降级路径。
- **私有/内部(private-internal)**:未导出、显式 internal、或仅为树内实现细节。**禁止依赖**;若某需求只有私有 API 能满足,按项目 AGENTS.md 要求停止并上报缺口。

## 已阅读并分析的来源

用户指定清单(全部读毕):

- `../deepseek-harness/AGENTS.md`
- `../deepseek-harness/docs/architecture.md`
- `../deepseek-harness/docs/development.md`
- `../deepseek-harness/docs/user/develop/basic/index.md`
- `../deepseek-harness/docs/user/develop/basic/publish.md`
- `../deepseek-harness/docs/subsystems/client-modules.md`
- `../deepseek-harness/packages/client/AGENTS.md`
- `../deepseek-harness/packages/client/ui-slots/README.md`
- `../deepseek-harness/packages/llm/token-meter/README.md`
- `../deepseek-harness/packages/llm/token-meter/src/projection.ts`
- StatsLine 对 `tokenUsage` projection 的实现:`packages/client/ui-conversation/src/client/chat/StatsLine.tsx` + 注册点 `src/client/apply.ts:429`
- 双面(Host+Client)第一方插件:`packages/session-query/session-log-export`、`packages/api/gateway`、`packages/client/connection`(详见 `docs/001` Q16)
- `ctx.slots.register` 第一方用例:`packages/client/ui-layout/src/client/index.ts`、`packages/session-query/session-log-export/src/client/index.ts`、`packages/extensions/ui-cordis/src/client/index.ts`

勘察中额外阅读的关键来源:

- `docs/subsystems/session.md`、`docs/subsystems/session-projection.md`、`docs/subsystems/persistence.md`、`docs/subsystems/storage.md`、`docs/api-gateway.md`
- `packages/core/session/src/types.ts`(`SessionEventMap`/`SessionEvent`)、`packages/core/session/src/index.ts`(`SessionStore`/`Session`/`session/*` 事件)
- `packages/llm/llm/src/types.ts`(`TokenUsage`/`StreamChunk`)、`packages/llm/token-meter/src/usage-projection.ts`(去重折叠)
- `packages/session/session-projection/src/index.ts`、`packages/session/session-persistence/src/index.ts`
- `packages/client/runtime/src/client/`(`slots.ts`、`sessions/projection-store.ts`、`index.ts` 标准 props)
- `packages/client/ui-layout/src/client/`(`index.ts`、`AppFrame.tsx`、`AppFrame.module.css`、`theme-presenter.ts`)
- `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`(生成的 slot 目录,42 项)
- `packages/client/modules/src/index.ts`(`dsh.client` 扫描/校验)、`packages/client/tsdown.client.ts`(`clientBundle`)、`packages/client/hmr`
- `apps/cli/src/plugin.ts`(`dsh plugin add`)、`packages/boot/app-boot/src/profile.ts`(profile/bundle 清单)
- `packages/host/webserver/src/index.ts`(`ctx.webServer`)、`packages/storage/`、`packages/settings/settings/README.md`
- `packages/identity/anonymous-user-id/`(README + `src/index.ts`)、`packages/util/home-paths/src/index.ts`

## 重勘察触发条件

DSH 检出更新(commit 变化)后,进入任何编码里程碑前必须重跑以下核对,并更新本文件与 `docs/003`:

1. `SessionEventMap` 中梁标依赖的成员是否仍在、字段是否变化:`assistant/chunk`、`assistant/message.usage`、`request/header`、`request/context`、`session/end-seed`、`turn/*`、`step/*`(`packages/core/session/src/types.ts`)。
2. `TokenUsage` 桶语义(disjoint、reasoning 含于 output)是否变化(`packages/llm/llm/src/types.ts:135`)。
3. `shell.overlay` slot 是否仍由 `ui-layout` 声明、click-through 语义是否不变(`packages/client/ui-layout/src/client/index.ts:83`;重新生成/查看 slot catalog)。
4. `dsh.client` 清单校验与 `exports["./client"]` 要求是否变化(`packages/client/modules/src/index.ts`),浏览器 bundle 包装格式(`window.__ModuleLoader__.load` banner)是否变化(`packages/client/tsdown.client.ts:269-271`)。
5. `dsh.bundle`/`dsh.profile` 清单与 `dsh plugin add` 对账逻辑是否变化(`apps/cli/src/plugin.ts`、`packages/boot/app-boot/src/profile.ts`)。
6. `ctx.sessionProjections`(`ProjectionDefinition`/`onChanged`/`snapshot`)与 token-meter `tokenUsage` 投影的 `(turn,step)` 去重规则是否变化(`packages/session/session-projection/src/index.ts`、`packages/llm/token-meter/src/usage-projection.ts`)。
7. `ctx.webServer.register`/`registerUpgrade` 路由 API 是否变化(`packages/host/webserver/src/index.ts:94-131`)。
8. `ctx.storageDomain` + `defineDomain` 契约是否变化(`docs/subsystems/storage.md`)。
9. `SESSION_FORMAT_VERSION` 是否 bump(会话日志读取兼容性)。
10. 树外 `@Remote` 支持是否出现(若 Typert 生成对树外开放,重新评估 `docs/002` 的通道选型)。
