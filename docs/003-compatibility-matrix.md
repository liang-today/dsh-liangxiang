# 003 — DSH 兼容性矩阵

基线:deepseek-harness `47f94385`(`0.1.0-rc.5`),见 [`docs/000`](000-dsh-reference.md)。**预发布警示**:DSH 根 AGENTS.md 明文 "foundation over blast radius"——首个 tagged release 前无任何兼容承诺,下表每一行都可能无告警破坏;升级 DSH 后按 000 的重勘察清单逐行核对。

约定:

- **分级**:公开 / 半公开 / 私有(定义见 000)。梁标不依赖任何私有触点;表中"私有"行仅记录明确的**不依赖**决定。
- **适配函数**:计划落在 `src/compat/dsh/` 的具名包装(每触点一个),host/client 业务代码只 import 适配函数。
- 路径相对 `../deepseek-harness`。

## Host 触点

| # | 触点 | 位置(file:symbol) | 分级 | 用途 | 破坏征兆 | 适配函数(计划) | 降级路径 |
|---|---|---|---|---|---|---|---|
| H1 | `ctx.on('session/event')` 火hose(seed 不发布) | `packages/core/session/src/index.ts:76`;`firstLiveSeq` L450-456 | 公开 | 方案 A 的用量观测入口 | 事件签名变化;seed 开始发布(会导致重放重计) | `observeSessionEvents(ctx, cb)` | 改用 H6 投影变更(方案 B) |
| H2 | `SessionEvent` envelope(`type`/`seq`/`time`/`data`) | `packages/core/session/src/types.ts:404-436` | 公开 | 幂等键 `(sessionId, seq)`、事件分发 | `seq` 连续性契约变化 | 同 H1(envelope 解析内聚于此) | 无(核心词汇;破坏即停摆并上报) |
| H3 | `assistant/chunk`(usage chunk)与 `assistant/message.usage`;`TokenUsage` | `types.ts:266,273`;`packages/llm/llm/src/types.ts:135-141,297` | 公开 | 用量样本来源;桶语义(disjoint、reasoning 含于 output) | 字段改名;桶语义变化(如 reasoning 单列) | `extractUsageSample(event)` | H6(方案 B);桶语义变化需改 `domain/` 公式并重审 |
| H4 | `request/header`(`EpochHeader.config`)与 `request/context`(`RequestContext`) | `types.ts:201-220,304,309`;`packages/llm/llm/src/call-config.ts:23-30` | 公开 | 方案 A 路由归因(精确 provider/model ID) | 事件缺席;provider/model 字段变化 | `extractRouteChange(event)` | 对受影响会话自动降级方案 B 口径 |
| H5 | `turn/*`、`step/*` 边界与 `(turn, step)` 字段 | `types.ts:243-256` | 公开 | R4 替换去重、R8 结算窗口 | 字段变化;步进语义变化 | 同 H1 | 以"每 usage 样本独立计 + cap"保守降级(如实展示为近似) |
| H6 | `ctx.sessionProjections.onChanged` / `snapshot`;`tokenUsage` 投影 | `packages/session/session-projection/src/index.ts:230-237,248-254`;`packages/llm/token-meter/src/projection.ts:68-77` | 公开(能力 seam,依组合挂载) | 方案 B 数据源 | registry 未挂载;key 消失;`TokenUsageProjection` 字段变化 | `observeTokenUsageProjection(ctx, cb)` | UI 显示"记账不可用",徽章仍渲染(冻结需求 9) |
| H7 | `session/end-seed` 与 `Session.firstLiveSeq`(seed/live 边界) | `types.ts:332`;`index.ts:408` | 公开 | 防 seed 重计的语义依据(R1/R3) | 边界语义变化 | 同 H1 | 水位(R2)仍兜底;重审 R3 |
| H8 | `ctx.sessions.get/list`;`session/created`/`disposed` | `packages/core/session/src/index.ts:1050-1065,54,64` | 公开 | 会话枚举、基线化时读 `session.seq` | API 更名 | `listLiveSessions(ctx)` | 仅靠 H1 事件内的 `session` 参数 |
| H9 | `ctx.sessionPersistence.list/readFrom`(历史会话) | `packages/session/session-persistence/src/index.ts:223-240,360` | 公开(能力 seam) | v0.1 非必需(基线化不补记历史);预留给未来核对 | 后端缺席 | `listStoredSessions(ctx)`(暂缓实现) | 不读历史,纯 live 记账 |
| H10 | `defineDomain` + `ctx.storageDomain.open` | `docs/subsystems/storage.md`;先例 `packages/workspace/workspace/src/index.ts:120` | 公开 | 账本持久化(§4.2) | 域契约/后端配置变化 | `openLiangbiaoDomain(ctx)` | 内存态 + 退出告警(不可静默);数据格式自带版本号 |
| H11 | `ctx.settings.register` | `packages/settings/settings/README.md`;`src/index.ts:436` | 公开 | 用户偏好 | schema/命名空间约定变化 | `registerLiangbiaoSettings(ctx)` | 偏好回退默认值,功能不受阻 |
| H12 | `ctx.webServer.register`/`registerUpgrade` | `packages/host/webserver/src/index.ts:94-131` | 公开 | §4.3 三端点(state/events/vote) | 路由 API 变化;前缀冲突策略变化 | `registerLiangbiaoRoutes(ctx, handlers)` | 无同级替代(commands 仅会话绑定);破坏即上报 |
| H13 | `dshHomePath` | `packages/util/home-paths/src/index.ts:98` | 公开 | 特殊文件路径(如迁移) | 更名 | 经 H10 间接使用为主 | 直接读 `DSH_HOME` env 语义(同文件契约) |
| H14 | `ctx.remote.commands.execute` + `ctx.commands.register` | `packages/interaction/commands/src/index.ts:246,296` | 公开 | **不依赖**(记录为次选动作通道) | — | — | — |
| H15 | ApiProxy 方法表 / `HostFrame` 联合 / `host/remote-event` 白名单 | `packages/host/apiproxy/src/api/events.ts:127-155`;`packages/api/remotes/src/remote-events.ts:17-29` | 半公开(封闭词表) | **不依赖**(明确排除) | — | — | — |
| H16 | `@Remote`/`@RemoteScope` + Typert 生成 | `packages/typert/protocol/src/index.ts:168-216`;`docs/api-gateway.md` | 公开但**树外不可用** | **不依赖**;000 重勘察项 10 跟踪其对树外开放 | — | — | 若开放,评估替换 H12 的 vote/state unary 面 |
| H17 | `compaction/summary.usage` | `packages/compaction/compaction/src/types.ts:51-52` | 公开(merge 成员) | **暂不计入**(与 token-meter 口径对齐) | 若 compaction 用量并入主折叠,需重审口径 | — | 见 `docs/004` 风险 4 |

## Client 触点

| # | 触点 | 位置(file:symbol) | 分级 | 用途 | 破坏征兆 | 适配函数(计划) | 降级路径 |
|---|---|---|---|---|---|---|---|
| C1 | `ctx.slots.register` / `ctx.slots.inject` | `packages/client/runtime/src/client/slots.ts:143-205`;`packages/client/ui-slots/src/index.ts`(`SlotCore`) | 公开 | 徽章注册 | register 选项/校验变化 | `registerOverlayEntry(ctx, comp, face)` | 无同级替代;破坏即上报 |
| C2 | `shell.overlay` slot(list/root,click-through) | `packages/client/ui-layout/src/client/index.ts:83,126`;渲染 `AppFrame.tsx:193-195` | 公开(SlotMap JSDoc) | 徽章座位 | slot 更名/删除;层 CSS 语义变化(遮挡/不可点) | 同 C1(slot 名收敛于此) | 备选座位 `conversation.composer.dock`(会话内,体验降级);或上游提案新 slot |
| C3 | inject `hooks` 隔间 + `HostObservable`(`getSnapshot`/`subscribe`) | `packages/client/ui-slots/src/index.ts:378-432`;`renderer.ts:31-34`;绑定 `web-react/src/scoped-slots.tsx:117-126` | 公开 | 快照 observable → `use<Name>` hook | 隔间约定变化 | `makeHooksFace(store)` | 经 inject 回调轮询(最后手段,有界) |
| C4 | `GlobalStandardProps`(`useSessions`/`useWorkspaces`) | `packages/client/runtime/src/client/index.ts:145-150` | 公开 | 暂不用(root scope 标准席位仅此两项,无 `useProjection`) | — | — | — |
| C5 | `--dsw-*` 主题 token;`body[data-ds-dark-theme]`;`prefers-reduced-motion` | `packages/client/ui-theme/src/styles/`;`ui-layout/src/client/theme-presenter.ts:12-42` | 公开 | 主题一致与可达性 | token 更名;暗色切换机制变化 | CSS 内聚一个 `liangbiao.css`(变量集中在 `:root` 别名) | 本地回退色板(灰阶),不阻断功能 |
| C6 | 浏览器 bundle 包装:`window.__ModuleLoader__.load({id, factory})` + externals 懒 CJS 表 | 格式源:`packages/client/tsdown.client.ts:170-273(banner 269-271)`;加载器 `packages/client/modules/src/client/system.ts`、`manifest.ts:9-25` | **半公开**(树内 preset 不发布;加载器行为有包 README) | 树外必须复刻的产物格式 | banner/require 协议变化;externals 集变化 | 隔离在 `tsdown.config.ts` 一处 + 构建后冒烟(加载 `lib/client.js` 断言 register 成功) | 升级时对照 `tsdown.client.ts` 重新复刻;此为最大单点风险(`docs/004` 风险 2) |
| C7 | `dsh.client` 扫描 + `exports["./client"]` + `/plugins/<id>/client.js` | `packages/client/modules/src/index.ts:112-141,344-364` | 公开 | Client 半接入 | 校验错误文案即征兆(载入失败 loud) | package.json 单点 | 无;破坏即上报 |

## 构建 / 安装触点

| # | 触点 | 位置 | 分级 | 用途 | 破坏征兆 | 降级路径 |
|---|---|---|---|---|---|---|
| B1 | `dsh.bundle`/`dsh.profile` 清单 + `dsh plugin add` 对账 | `apps/cli/src/plugin.ts:59-91,120`;`packages/boot/app-boot/src/profile.ts:42-50,371-403` | 公开 | 安装路径 | add 后未入 `dsh.profile.bundles`(警告文案) | `--patch` 手动挂载(开发可用) |
| B2 | git 安装 `prepare` + pnpm `allowBuilds` | `docs/user/develop/basic/publish.md:161-173` | 公开 | 开发分发 | pnpm 策略变化 | 发 tarball/npm |
| B3 | HMR stat-poll(`lib/client.js`)+ SSE `/plugins/events` | `packages/client/hmr/src/index.ts:148-190`;`src/events.ts:16` | 半公开 | 仅开发体验 | 热替换失效 | 手动整页刷新;无运行时影响 |

## 汇总

- 运行时依赖共 **17 个 Host 行 + 7 个 Client 行**,其中实际依赖:公开 15 项、半公开 2 项(C6 bundle 包装格式、B3 仅开发);**私有 0 项**。
- 明确排除:H14(commands 作投票通道)、H15(ApiProxy/HostFrame)、H16(树外 `@Remote`)、C4。
- 最大风险集中在 C6 与"rc 预发布无兼容承诺"总项;缓解与观测点见 [`docs/004`](004-open-risks.md)。
