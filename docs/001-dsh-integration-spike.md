# 001 — DSH 集成勘察问答(16 问)

依据基线:见 [`docs/000-dsh-reference.md`](000-dsh-reference.md)(deepseek-harness `47f94385`,`0.1.0-rc.5`)。所有路径相对 `../deepseek-harness`。分级含义(公开/半公开/私有)见 000。每问给出:结论、证据、分级、对梁标的含义。

> **R2 语义提示(2026-08-16)**:本文的 DSH 技术事实仍然有效;个别"对梁标"注解使用了已废弃的旧业务词汇(梁签/铸造/方案 A 目标模型口径)。现行业务语义以 [`PRODUCT_FREEZE_V0.1.md`](PRODUCT_FREEZE_V0.1.md) 为准:Token→香火(50K = 1 炷)、无目标模型过滤、投票 1 票 = 1 炷。

---

## Q1 — 树外插件如何同时提供 Host 与 Web Client 部分?

**结论**:一个 npm 包双面。Host 半是普通 Cordis 插件模块(导出 `apply(ctx)`/`inject`),由包内 `dsh.bundle` 声明的 `cordis.patch.yml` 把插件行插进 Loader;Client 半不需要 Host 侧注册——`ctx.clientModules`(`ClientModuleRegistry`)扫描 Loader 里每个 entry 的 `package.json`,发现 `dsh.client` 声明 + `exports["./client"]` 即把浏览器 bundle 编入 `window.__DSH_BOOT__` 启动图,并以 `GET /plugins/<包名>/client.js` 服务。两半靠**同一包名 + Loader 行**对齐。

**证据**:

- 插件形态与 `--patch` 挂载:`docs/user/develop/basic/index.md`(`apply(ctx)`、`inject`、`ctx.effect`)。
- 清单驱动扫描:`docs/subsystems/client-modules.md` § The scan;实现 `ClientModuleRegistry.resolveMeta`,`packages/client/modules/src/index.ts:344-364`;bundle 路由与 index tap 同文档。
- 双面第一方先例:`packages/session-query/session-log-export`(Host `src/index.ts:18-26` 注册 `/export` 命令;Client `src/client/index.ts` 挂 slot)、`packages/api/gateway`(Host `TypertGatewayService`;Client 安装 `ctx.remote`)、`packages/client/connection`(Host 注册 `/api` 与 WebSocket downlink;Client 为连接控制器)。

**分级**:公开(`docs/subsystems/client-modules.md`、`docs/user/develop/basic/*`)。

**对梁标**:单包 `dsh-liangbiao`,`src/index.ts` 为 Host 半、`src/client/index.ts` 为 Client 半;打包结构照抄 session-log-export。

---

## Q2 — package.json 需要哪些 dsh manifest、exports、build output?

**结论**:

| 项 | 要求 | 证据 |
|---|---|---|
| `dsh.bundle` | `{ "patch": "./cordis.patch.yml" }`,patch 里以包名引用插件行 | `docs/user/develop/basic/publish.md` § The bundle manifest |
| `dsh.client` | `{ "platform": "web", "inject"?: string[], "immediately"?: boolean }`;`platform` 必须为 `'web'` 才入表;`inject` 仅信息性(preflight/HMR diff),不排序激活 | 校验:`packages/client/modules/src/index.ts:112-141,350`;语义:`packages/client/AGENTS.md` 第 3 条 |
| `exports` | `"."` → `lib/index.js`(Host 半,ESM);`"./client"` → `lib/client.js`(必须,缺失报 `declares dsh.client but exports no "./client" bundle`,`modules/src/index.ts:356`);建议再加 `"./package.json"` | `packages/client/AGENTS.md:94`(树内骨架还含 `./invariant`、`./src/*`) |
| `type` / `main` | `"type": "module"`、`main: lib/index.js` | 同上 |
| `files` | 至少 `lib/index.js`、`lib/client.js`、`cordis.patch.yml`、类型声明 | session-log-export `package.json`;publish.md |
| Host 半产物 | ESM(`format: ['esm']`) | `packages/client/tsdown.client.ts:93-109` |
| Client 半产物 | `lib/client.js`,CJS factory 包装:banner `window.__ModuleLoader__.load({ id, factory: (require) => {`、footer `return module.exports; } });`;`react`、`react/jsx-runtime`、`@deepseek-ai/cordis` 与若干 `@deepseek-ai/dsh-client-*` 为 external,运行时经懒 CJS 模块表 `require` | `packages/client/tsdown.client.ts:170-273(banner 269-271)`;浏览器半 `packages/client/modules/src/client/system.ts`、`manifest.ts:9-25` |
| git 安装 | 需自包含 `prepare` 脚本(转译 `src/`,不依赖 monorepo);用户侧需 pnpm `allowBuilds` 允许 | `publish.md:161-173`,树外先例 turtle-ui |

**分级**:`dsh.bundle`/`dsh.client`/`exports["./client"]` 消费面公开;树内 `clientBundle` preset 半公开(树外须复刻其包装格式,见 `docs/003`、`docs/004`)。

**对梁标**:同时声明 `dsh.bundle` 与 `dsh.client`——只有 `dsh.client` 而无 `dsh.bundle` 时,`dsh plugin add` 只装成普通依赖、插件行不进 Loader,Client 半也就不会被扫描(扫描对象是 Loader entries)。

---

## Q3 — 如何在 WebUI 全局区域注册长期存在的 UI 组件?

**结论**:Client 半 `apply` 中:

```ts
ctx.slots.inject('shell.overlay', () => ctx.slots.register(
  { name: 'shell.overlay', id: 'liangbiao', order: 100 },
  LiangbiaoBadge,
))
```

`ctx.slots.inject` 等待目标 slot 声明就绪才执行注册、声明塌缩时自动 dispose、重声明时重跑;注册寿命随插件 fiber,卸载即回收。组件常驻(root scope 不随会话切换卸载)。

**证据**:`SlotRegistry.inject`,`packages/client/runtime/src/client/slots.ts:143-205`;规则成文于 `packages/client/AGENTS.md` § New plugin package checklist 第 4 条;注册示例见 slot catalog `shell.overlay` 条目的 `example` 字段(`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts:1474`)。

**分级**:公开。

---

## Q4 — 当前有哪些公开 UI Slot 适合放置梁标?

**结论**:shipped web 组合共 **42 个 slot**(权威枚举:生成目录 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`,由 `scripts/gen-client-catalog.ts` 从 SlotMap declaration merge 生成)。适合全局常驻梁标的座位是 **`shell.overlay`**;会话内备选是 `conversation.composer.dock` 与 `conversation.session.header.utilities`。

全量清单(kind/scope/声明者摘自 catalog):

| slot | kind | scope | 声明者(所在 slot / 包) |
|---|---|---|---|
| `root` | single | root | runtime 内建(始终存在) |
| `sidebar` | single | root | `root` / client-ui-layout |
| `conversation` | single | session-maybe | `root` / client-ui-layout |
| `details` | single | session | `root` / client-ui-layout |
| `shell.overlay` | list | root | `root` / client-ui-layout |
| `sidebar.workspaces` | single | root | `sidebar` / client-ui-sidebar |
| `sidebar.settings` | single | root | `sidebar` / client-ui-sidebar |
| `sidebar.footer.action` | list | root | `sidebar` / client-ui-sidebar |
| `sidebar.workspaces.directoryFlow` | single | root | `sidebar.workspaces` / client-ui-workspace |
| `conversation.session` | single | session | `conversation` / client-ui-conversation |
| `conversation.session.header` | single | session | `conversation` / client-ui-conversation |
| `conversation.session.header.actions` | list | session | `conversation.session.header` / client-ui-conversation |
| `conversation.session.header.utilities` | list | session | `conversation.session.header` / client-ui-conversation |
| `conversation.view` | list | session | `conversation.session` / client-ui-conversation |
| `conversation.chat.node` | keyed | session | `conversation.view` / client-ui-conversation |
| `conversation.chat.commandview` | keyed | session | `conversation.chat.node` / client-ui-conversation |
| `conversation.chat.turnTail` | chain | session | `conversation.chat.node` / client-ui-conversation |
| `conversation.chat.assistant-actions` | list | session | `conversation.chat.node` / client-ui-conversation |
| `conversation.details.tool` | single | session | `details` / client-ui-conversation |
| `conversation.composer` | chain | session | `conversation` / client-ui-conversation |
| `conversation.composer.bar` | single | session-maybe | `conversation` / client-ui-conversation |
| `conversation.composer.dock` | list | session | `conversation` / client-ui-conversation |
| `conversation.hero.workspace` | single | root | `conversation` / client-ui-conversation |
| `conversation.hero.agentPreset` | single | root | `conversation` / client-ui-conversation |
| `conversation.hero.workspace.directoryFlow` | single | root | `conversation.hero.workspace` / client-ui-workspace |
| `conversation.input.dock` | list | session | `conversation` / client-ui-conversation |
| `conversation.input.left` | list | session | `conversation` / client-ui-conversation |
| `conversation.input.right` | list | session | `conversation` / client-ui-conversation |
| `conversation.input.model` | single | session | `conversation.composer.bar` / client-ui-conversation |
| `conversation.input.plan` | single | session | `conversation.composer.bar` / client-ui-conversation |
| `conversation.input.overlay` | list | session | `conversation` / client-ui-input-trigger 声明族 |
| `settings.trigger` | single | root | `sidebar.settings` / client-ui-settings-general |
| `settings.header` | single | root | `sidebar.settings` / client-ui-settings-general |
| `settings.action` | list | root | `sidebar.settings` / client-ui-settings-general |
| `settings.close` | single | root | `sidebar.settings` / client-ui-settings-general |
| `settings.section` | list | root | `sidebar.settings` / client-ui-settings-general |
| `settings.onboarding` | list | root | `sidebar.settings` / client-ui-settings-general |
| `settings.general.item` | list | root | `settings.section` / client-ui-settings-general |
| `settings.plugins.tab` | list | root | `settings.section` / client-ui-settings-plugins |
| `settings.plugin.item` | list | root | `settings.plugins.tab` / client-ui-settings-plugins |
| `tool.call.toolview` | keyed | session | `conversation.chat.node` / client-ui-tool |
| `tool.view.cordis` | keyed | session | `tool.call.toolview` / extensions/ui-cordis |

`shell.overlay` 的契约(SlotMap JSDoc,`packages/client/ui-layout/src/client/index.ts:73-83`):"Frame-wide floating layer, above every column and outside their scroll containers. Deliberately generic and unowned by any feature: a badge, a toast stack or a status pill all belong here… The layer itself is click-through — entries opt back into pointer events… This is the additive seat for a frame-wide surface of your own."catalog 标注 `replaceRisk: 'none'`、`occupants: []`(当前无第一方占用者)。渲染处:`AppFrame.tsx:193-195`(`data-shell-overlay` 层),层样式 `position:absolute; inset:0; z-index:20; pointer-events:none`、子元素 `pointer-events:auto`(`AppFrame.module.css:110-118`)。

**分级**:SlotMap 声明与 `shell.overlay` 契约公开(JSDoc);slot catalog 本身半公开(供 `cordis_inspect` 的生成物,但内容与 SlotMap 同源)。

**对梁标**:注册 `shell.overlay`;`settings.general.item`(list/root)可用于后续在设置页放梁标偏好项(本阶段不做)。

---

## Q5 — 不修改 DSH core,能否实现右侧停靠式全局梁标?

**结论**:**能**。`shell.overlay` 就是为此设计的加法座位:root scope、list kind、click-through、fresh `id` 与既有条目并存。**不存在**专门的"right-rail dock" slot,贴右由梁标条目自身 CSS 定位实现(overlay 层覆盖全帧,`inset: 0`,条目绝对定位到右缘、避开 composer 与滚动容器)。runtime 明文禁止注册 `root`(会替换整个 AppFrame):`packages/client/runtime/src/client/slots.ts:27-40` "DO NOT register here… For a surface of your own that floats over the whole app, register into `shell.overlay` instead"。

**分级**:公开。无需上游贡献;若未来需要"官方右栏 dock"语义(如与 `details` 栏互避),再考虑向上游提议一个 `shell.dock.right` 子 slot——当前 overlay 足够。

---

## Q6 — Host 与 Client 之间推荐什么 typed remote / observable / action 通道?

**结论**(树外可用性是关键约束):

1. **`@Remote`/`@RemoteScope` 对树外不可用**。装饰器定义在 `packages/typert/protocol/src/index.ts:168-216`,但 Host-for-Client 契约由 Typert 仅在树内 Host tsdown 生成(种子 `tsconfig.host.json`,`docs/api-gateway.md:97`、`docs/development.md:76`);Client 侧贡献必须由 `api-remotes` 显式 import + `$mount`(`packages/api/remotes/src/client/index.ts:105-112`),树外包无法加入该装配;SRC 开发回退只解决 Host 源码进程的 dispatch,Client 拒绝挂载无严格 codec 的 SRC 描述符(`docs/api-gateway.md:131-137`)。
2. **会话内只读模型 → session projection**(公开):Host `ctx.sessionProjections.register(ProjectionDefinition)`,wire 走 history tail 基线 + `session/projection` push frame,Client 组件经标准席位 `useProjection(key)` 读取(`docs/subsystems/session-projection.md`;`UseProjection`,`packages/client/runtime/src/client/sessions/projection-store.ts:33-40`)。
3. **全局数据与动作 → `ctx.webServer.register(route)` 自建 HTTP + SSE**(公开扩展点):`packages/host/webserver/src/index.ts:94-131`(`register`/`registerUpgrade`/`registerFallback`);第一方先例 `dsh-client-hmr` 的 SSE endpoint `/plugins/events`(`packages/client/hmr/src/events.ts:16`、`src/index.ts:148-190`)。
4. **次选动作通道 → `ctx.remote.commands.execute`**(公开,但绑定 live session/agent、走 slash 语义与会话日志):Host `ctx.commands.register`(`packages/interaction/commands/src/index.ts:246`),Client 先例 `packages/client/ui-commands/src/client/service.ts:374`。
5. ApiProxy unary 方法表与 Connection `HostFrame` 联合是**封闭词表**(`packages/host/apiproxy/src/api/events.ts:127-155`;`host/remote-event` 白名单固定于 `packages/api/remotes/src/remote-events.ts:17-29`),树外不可扩展——**不依赖**。
6. Client 组件消费:任何随时间变化的值封装成 `HostObservable`(`getSnapshot`/`subscribe`,`packages/client/ui-slots/src/renderer.ts:31-34`)放进注册时 inject 返回值的 `hooks` 隔间,渲染器自动绑成 `use<Name>` hook(`packages/client/web-react/src/scoped-slots.tsx:117-126`)。

**分级**:2/3/4/6 公开;1 的否定结论依据公开文档;5 半公开(仅作"不可用"结论)。

**对梁标**:全局状态快照 + 增量走自建 `GET /liangbiao/api/state` + `GET /liangbiao/api/events`(SSE);投票动作走 `POST /liangbiao/api/vote`(带幂等键)。详见 `docs/002`。

---

## Q7 — Host 端如何枚举当前和历史 Session?

**结论**:

- **当前(live,内存)**:`ctx.sessions.get(id)` / `ctx.sessions.list()`(创建序,返回新数组)——`SessionStore`,`packages/core/session/src/index.ts:1050-1065`;另有 `session/created`/`session/disposed` 事件(同文件 L54/L64)。
- **历史(持久化)**:`ctx.sessionPersistence`(抽象 seam,`packages/session/session-persistence/src/index.ts`):`list(signal?): Promise<SessionHeader[]>`(L223-240,轻量元数据列举)、`listSnapshots()`(带变更 token)、`inspect`/`load`/`readFrom(id, fromSeq, signal?)`。后端可互换:JSONL(+zstd)或 SQLite。
- **历史会话的投影冷读**:`ctx.sessionProjectionCache.coldSnapshot(id, signal?)`(`docs/subsystems/session-projection.md`,`packages/session/session-projection-cache/src/index.ts:71`),零全量日志加载。

**分级**:`ctx.sessions` 公开;`ctx.sessionPersistence`/`sessionProjectionCache` 公开文档的能力 seam(依赖组合挂载了后端,web 组合默认挂载)。

---

## Q8 — Host 端如何订阅新的 durable session events?

**结论**:根 context 上 `ctx.on('session/event', (session: Session, event: SessionEvent) => …)`——post-commit、fire-and-forget 的追加流,覆盖所有已 enter 会话;listener 异常被记录并遏制,不影响已提交的 append。**构造 seed(resume/fork/replay)不发布**:加载历史不会在该事件上重放,监听者只见 `session.firstLiveSeq` 之后的真实新 append。存盘历史中的 seed/live 边界由最后一条 `session/end-seed` 事件标记(该事件本身也不发布)。不存在"对磁盘上全部会话的新事件订阅"——冷会话必须显式 `load`/`readFrom`,或等它被 resume 后进入火hose。

**证据**:事件声明 `packages/core/session/src/index.ts:76`(文档 `docs/subsystems/session.md:805-826`);seed 不发布语义 `Session.firstLiveSeq` JSDoc(`index.ts:450-456`;文档 `session.md:386-408`);`session/end-seed` 声明 `packages/core/session/src/types.ts:332`。

**分级**:公开。

---

## Q9 — 如何读取 provider 上报的 token usage(而非 Context Occupancy 估算)?

**结论**:provider 上报用量只存在于两类 durable 事件:

- `assistant/chunk`:`{ turn, step, chunk: StreamChunk }`,当 `chunk.type === 'usage'` 时携带 `chunk.usage: TokenUsage`(`packages/core/session/src/types.ts:266`;`StreamChunk` usage 变体 `packages/llm/llm/src/types.ts:297`);
- `assistant/message`:`{ turn, step, message, usage?: TokenUsage }`——"the model output and its accounting travel together (there is no separate usage record)"(`types.ts:267-273`)。

`TokenUsage`(`packages/llm/llm/src/types.ts:135-141`):`inputTokens`(仅未命中缓存的输入)、`outputTokens`、`cacheReadTokens?`、`cacheWriteTokens?`、`reasoningTokens?`(已含于 `outputTokens`,不得再加)。三个输入桶 disjoint,billed input = 三桶之和。

会话累计现成读法:token-meter 的 `tokenUsage` 投影(`TokenUsageProjection`:`uncachedInputTokens`/`outputTokens`/`cacheReadTokens`/`cacheWriteTokens`,`packages/llm/token-meter/src/projection.ts:13-18`;映射 `inputTokens → uncachedInputTokens`,`src/usage-projection.ts:31-36`)。

**明确不用**:`contextPressure`/`contextBreakdown` 投影与 `ctx.tokenMeter.measure()` 的 surface 字段是占用参考/启发式估算,token-meter README § "Context occupancy is an approximation, by design" 明文不可作记账输入。

**分级**:公开。

---

## Q10 — usage chunk 与最终 assistant usage 如何去重?

**结论**:token-meter 的折叠规则(照抄即正确):同一 `(turn, step)` 的后一个样本**替换**前一个,而非累加。usage chunk 先计入(即使请求随后失败也保留);同 `(turn, step)` 的最终 `assistant/message.usage` 到达时用 `addReplacing(totals, previous, buckets)` 把该步样本换成最终值。单槽 `last: { turn, step, buckets }` 依赖日志序性质:"once a later step reports usage, a legal log never reports usage for an earlier step again"(README L28)。

**证据**:`tokenUsageProjectionDefinition.apply`,`packages/llm/token-meter/src/usage-projection.ts:112-137`;规则成文于 `packages/llm/token-meter/README.md` § Session projections。

**分级**:公开(README 成文 + 实现)。

**对梁标**:方案 A 的自建折叠必须复刻此规则(实现独立编写,不复制源码);方案 B 直接消费 `tokenUsage` 累计值,自动继承该规则。

---

## Q11 — 如何获取一次模型调用对应的 provider、model、turn、step、event sequence?

**结论**:

- **turn/step**:usage 事件自身携带 `{ turn, step }`;边界事件 `turn/start`/`turn/end`/`step/start`/`step/end`(`packages/core/session/src/types.ts:243-256`)。
- **provider/model**:`request/header` 事件 `{ header: EpochHeader, reason }`(每次请求前在 step 内追加,`reason: 'initial' | 'resume' | 'change'`),`EpochHeader.config: LlmCallConfig` 含 `provider`/`model`(`types.ts:201-210,304`;`LlmCallConfig` 见 `packages/llm/llm/src/call-config.ts:23-30`);`request/context` 事件为 `RequestContext { provider, model, contextWindow? }`(`types.ts:213-220,309`),仅路由或容量变化时记录。两者都是**注册路由的精确 ID**,不是显示名——满足"禁止用显示标签/猜测模型名判定目标模型"的冻结需求。
- **event sequence**:`SessionEvent.seq` 单调、`seq = log.length` 连续(赋值 `packages/core/session/src/index.ts:627-630`;envelope `types.ts:404-411`,另有 `time` Unix 毫秒)。
- **关联方法**:无独立 correlation id;在同一会话的 seq 序上,对某 `(turn, step)` 的 usage,取其之前最近的 `request/header`(必要时叠加最近的 `request/context`)即该次调用的路由。辅助只读 `session.requestHeader()`/`session.requestContext()` 只折叠到"当前最新",不适合逐步归因(`index.ts:670-698`)。

**分级**:公开。

---

## Q12 — 如何处理 replay、restart、compaction、reconnect,避免重复铸造梁签?

**结论**(逐情形):

| 情形 | DSH 事实 | 梁标对策 |
|---|---|---|
| replay/resume | seed 不上火hose(Q8);投影对未建 cell 懒惰全量重折,累计值幂等(`packages/session/session-projection/src/index.ts:388-412`);persistence append-only,crash 只追加 synthetic closer 不改写历史 | 只对火hose 上的新 append 记账;以 `(sessionId, seq)` 已计数水位持久化,重启后 `seq <= watermark` 一律丢弃 |
| restart(DSH 进程重启) | `(sessionId, seq)` 对已提交事件跨重启稳定(append-only;第一方 telemetry 同样以 `(session.id, event.seq)` 去重,`packages/session/session-telemetry/README.md`) | 水位账本落 `ctx.storageDomain`;崩溃后从水位续算 |
| fork | 子会话新 id,复制父前缀且**保留原 seq**(`packages/core/session/src/index.ts:1081-1138`);`header.parentSession`/`seedLength` 记录谱系 | 首次见到任何会话时把该会话水位基线设为当前日志末尾(基线化),父前缀用量不再计——同时天然满足"不追溯授予梁气"的冻结需求 |
| compaction | 只追加(`compaction/start/summary/end` + `surfaceOp: {op:'replace'}` shadow 表面),原始用量事件仍在完整 durable log;摘要调用自身的 `compaction/summary.usage`(`packages/compaction/compaction/src/types.ts:51-52`)不进 `tokenUsage` 折叠 | 累计口径不受 compaction 影响;摘要调用用量按口径决定(v0.1 与 token-meter 对齐:不计,见 `docs/004` 风险) |
| reconnect(浏览器) | client 投影 store 是 higher-seq-wins(`packages/client/runtime/src/client/sessions/projection-store.ts:134-137`) | 梁标 SSE 重连后全量快照重读 + 单调 revision,旧帧丢弃;投票提交带幂等键,重发不重计 |

**分级**:公开(各行证据如上)。

---

## Q13 — DSH 推荐用什么机制保存插件本地状态?

**结论**:

- **账本类状态(梁气、水位、梁签、待发投票)** → `defineDomain(spec)` + `ctx.storageDomain.open(spec)`(`docs/subsystems/storage.md`;hub `ctx.storage`,后端 `json`/`sqlite`,web 组合默认 json,root 为 `dshHomePath('storages')`——`packages/bundle/web-app/cordis.patch.yml:54-62`)。第一方先例:workspace(`packages/workspace/workspace/src/index.ts:120`)、message-feedback(`packages/feedback/message-feedback/src/index.ts:174`,domain 名 `message_feedback`)、projection cache(domain `session_projcache`)。不存在按插件自动分区的通用 KV;域名自取(梁标用 `liangbiao`)。
- **用户偏好** → `ctx.settings.register(ns, schema, { base? })` 得 `SettingsScope`(`get`/`watch`/`update`),存 `$DSH_HOME/settings.yaml`(`packages/settings/settings/README.md`;文件提供方 `packages/settings/settings-file/src/index.ts:55-56`)。README 明确它是偏好/配置面,不是账本。
- **裸文件(仅特殊场合)** → 路径一律经 `dshHomePath(...)`(`packages/util/home-paths/src/index.ts:98`,公开;boot 亦注入 Loader `!!js` 上下文);先例 `$DSH_HOME/.anonymous-user-id`。

**分级**:全部公开。

---

## Q14 — 安装包如何通过 `dsh plugin add` 装进 profile?

**结论**:`dsh plugin --profile <name> add <pkg|./dir|github:owner/repo#sha|.tgz>` → CLI 把 verb 原样转发给 profile 目录里的 pnpm(首次自动 `initProfile`,`@deepseek-ai/dsh-base` 为第一层);成功后 `reconcilePlugins` 读被装包的 `dsh.bundle`,有则把包名追加进 profile 清单的 `dsh.profile.bundles`(去重),无则警告"installed as a plain dependency, not a profile layer"。层序:base → 各 bundle(安装序)→ profile `cordis.patch.yml` → home 级 patch → `--patch` overlay;后层按行 id 整体覆盖 config。git 安装拿到的是源码,需要包内 `prepare` 自建产物 + 用户在 profile `pnpm-workspace.yaml` 里 `allowBuilds` 放行;或直接发 npm/tarball 免构建。

**证据**:`apps/cli/src/bin.ts:41-42` → `runPlugin`(`apps/cli/src/plugin.ts:120`);`reconcilePlugins`(L59-91,追加 L65-69,警告 L70-74);boot 侧 `DshBundleManifest`/`DshProfileManifest`/`loadProfile`(`packages/boot/app-boot/src/profile.ts:42-50,371-403`);教程 `docs/user/develop/basic/publish.md`。

**分级**:公开(`reconcilePlugins` 为 CLI 实现细节,行为由 publish.md 成文)。

---

## Q15 — Client bundle 如何做 HMR / 最快开发循环?

**结论**:`dsh-client-hmr`(web-app 组合默认挂载,`packages/bundle/web-app/cordis.patch.yml:142-143`):Node 半对启动图中每行的 `clientPath`(即各包 `lib/client.js`)默认 500ms stat-poll,变化即 `ctx.clientModules.rebuilt(id)` 并经 SSE `/plugins/events` 广播 `{type:'rebuilt', id, rev}`;浏览器半热替换该 entry(invalidate → prefetch → refresh,**非整页刷新**;shell 与非图内包仍需手动刷新)。HMR 不负责编译——"any tsdown watch process producing the bundle therefore triggers HMR"(`packages/client/hmr/README.md:7`)。

**树外最快环**:插件包自己跑 `tsdown --watch`(或反复 `pnpm --filter <pkg> bundle`)持续写出 `lib/client.js` + 一个已挂 HMR 的 `dsh web` 进程即可;stat-poll 只看 Loader entry 的 `clientPath`,**与 profile 安装或 `--patch` 挂载方式无关**(树内 `scripts/dev-web.ts` 只扫描树内 `packages/*/*`,不监视树外目录,树外无需它)。Host 半改动仍需重启 `dsh web`。

**证据**:`packages/client/hmr/src/index.ts:148-190`、`src/events.ts:16`、`src/client/index.ts:8-10`;`packages/client/AGENTS.md:98`。

**分级**:HMR 行为半公开(包 README + `docs/subsystems/client-modules.md` 提及);开发环建议不构成运行时依赖。

---

## Q16 — 当前最适合参考的第一方插件?

| 参考点 | 插件 | 位置 | 学什么 |
|---|---|---|---|
| 产品型双面插件(与梁标形态最像) | `@deepseek-ai/dsh-session-log-export` | `packages/session-query/session-log-export` | Host 注册 command、Client 经 `slots.inject` 挂 `conversation.session.header.utilities`、inject 返回 `hooks` observable + 回调(`src/client/index.ts:40-49`)、package.json/exports/tsdown 全套骨架 |
| 基础设施双面插件 | `@deepseek-ai/dsh-api-gateway`、`@deepseek-ai/dsh-client-connection` | `packages/api/gateway`、`packages/client/connection` | Host 服务 + `dsh.client` `immediately: true` 的双半对齐;connection 的 Host 半注册 HTTP/WebSocket 路由 |
| slot 声明 + store + 根注册 | `dsh-client-ui-layout` | `packages/client/ui-layout/src/client/index.ts:116-143` | `children` 声明(含 `shell.overlay`)、store 工厂、`ctx.effect` 生命周期、theme presenter |
| 投影单元注册 | `@deepseek-ai/dsh-token-meter` | `packages/llm/token-meter/src/index.ts:87-90`、`src/usage-projection.ts` | `ctx.inject(['sessionProjections'], …)` 可选挂载模式、纯函数折叠、`(turn,step)` 去重、`stateVersion` |
| keyed slot + 子 slot 声明 | `extensions/ui-cordis` | `packages/extensions/ui-cordis/src/client/index.ts:115-134` | `key` 路由、children 声明、inject face |
| 树外打包(git 安装) | turtle-ui | `github.com/deepseek-harness/turtle-ui`(树内仅文档引用) | 自包含 `prepare` + 独立 tsdown(转译 `src/`,无 project references) |

**分级**:各包行为公开(README);作为"参考"不构成运行时依赖。
