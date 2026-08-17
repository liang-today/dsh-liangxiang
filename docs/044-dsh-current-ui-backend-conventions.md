# 044 — DSH 当前 UI / Host 集成约定（本阶段实际使用）

基线 `47f94385`。每项：结论 + 源码证据 + 梁相落点。全部经 `src/compat/dsh/` 隔离。

## Host ↔ Client 通信

- **推荐（树外唯一全局通道）**：`ctx.webServer.register(route)` 自建 HTTP + SSE（`@Remote`/Typert 对树外不可用，ApiProxy/HostFrame 是封闭词表——docs/001-Q6）。
- API：`register({kind: 'exact'|'prefix', path, handler(req: IncomingMessage, res: ServerResponse)})` 返回 disposer;重复路径抛错;handler 拥有完整响应生命周期（可长held，SSE 可行）;进程退出时服务显式销毁所有连接。`packages/host/webserver/src/index.ts:24-131、228-238`。
- 梁相落点：单条 prefix 路由 `/liangxiang/api`（state / events(SSE) / vote），`compat/dsh/web-routes.ts`。

## 用量观测

- `ctx.sessionProjections.onChanged((session, key, value, seq) => …)`：key=`'tokenUsage'` 时 value 为 schema 校验后的四桶累计;注册为调用 fiber 上的 effect（服务为 traceable service，`this.ctx` 绑定调用方），卸载自动回收。`packages/session/session-projection/src/index.ts:81-86、230-238`。
- `ctx.sessionProjections.snapshot(session)`：同步一致读。index.ts:248-255。
- `ctx.sessions.list()`：live 会话枚举（启动补扫）。`packages/core/session/src/index.ts:1050-1065`。
- 梁相落点：`compat/dsh/usage-observer.ts`。

## 本地持久化

- `ctx.storageDomain.open(spec)`：spec = `{name, version, tables: {t: {valueSchema}}}`;open 时校验既有记录（`valueSchema.parse`）;表句柄 `get/entries/keys/size/put/delete/update`，读同步、写入队且先落盘后改内存;caller 持有句柄并负责 `close()`（典型作为自身 effect disposer）。`packages/storage/storage-domain/src/spec.ts`、`src/domain.ts`、`docs/subsystems/storage.md`。
- web 组合默认 json backend，落 `$DSH_HOME/storages`;版本不匹配拒开（`version-mismatch`，无迁移——预发布姿态）。
- 第一方先例：workspace（`packages/workspace/workspace/src/index.ts:120`）、message-feedback（`:174`）。
- 梁相落点：domain 名 `liangxiang` v1，表 `watermarks / daily_usage / ledger / votes / aggregates`（`compat/dsh/storage.ts`）。梁相不引入 zod 依赖——spec 的 `valueSchema` 传入自写窄校验对象（运行时仅要求 `.parse(raw)`，spec.ts:29 + index.ts:121 验证）。

## 服务可选性 / 注入

- cordis 4 `inject` 声明**必需**服务（`node_modules/@deepseek-ai/cordis/src/registry.ts:19、104-106`——"only loads while all are available";无 required/optional 拆分）。
- 可选依赖用嵌套 `ctx.inject([...], cb)`（第一方先例：token-meter `packages/llm/token-meter/src/index.ts:87`）。
- 梁相落点：host `apply` 顶层零 inject;三个嵌套 inject（`webServer` / `storageDomain` / `sessionProjections`+`sessions`），任一缺席时对应能力降级（记账不可用 / 内存态），UI 仍渲染（冻结需求 9）。

## UI Slot / 主题 / 提示

- 座位不变：`shell.overlay`（root/list/click-through，docs/003 C1/C2）。
- 主题 token：`--dsw-alias-*` 语义族（`packages/client/ui-theme/src/styles/design-platform.css`）;按钮正确配对是 `--dsw-alias-button-primary-fill` + `--dsw-alias-label-primary-foreground`（明暗各自成对，:191/:205、:283/:297）。
- toast/dialog：`ui-primitives` 为树内 body-portal 组件，未对树外发布稳定入口——梁相面板内自绘反馈行，不依赖。

## Business date

DSH 无时区/业务日期设施（040-E）。梁相 Host 自持 `BusinessDateProvider`（Intl.DateTimeFormat + 显式 dev timezone 配置，默认 `Asia/Shanghai`，`LIANGXIANG_BUSINESS_TZ` 覆盖）;在线后以 Backend 为准。

## 生命周期纪律

- 全部注册走 effect/disposer;SSE 连接集合在插件卸载时显式 `res.end()`;快照 cadence 定时器经 `ctx.effect` 清理;无每 tab 轮询（SSE 推送）。
