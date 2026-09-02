# COMPATIBILITY — DSH 兼容性权威证据

本文件是梁相当前唯一的 DSH 兼容性事实表。旧的调研、实施记录和带行号的
RC 文档只保留历史价值；若与本文件冲突，以本文件和钉住的 DSH 源码为准。
DSH 仍处于 Developer Preview，任何升级都必须重新审计，不能从版本号推断兼容。

## 当前基线

| 项 | 当前事实 |
|---|---|
| 梁相版本 | 1.1.4 |
| 发布状态 | Unreleased（公开稳定版仍为 `1.0.7`） |
| npm 包 | 当前源码 `dsh-liangxiang@1.1.4`，未发布 |
| DSH CLI / 包线 | `0.1.2-alpha.4` |
| DSH tag | `dsh-v0.1.2-alpha.4` |
| DSH commit | `4e84901e6471b79ec0338099867ebb4606d12bb5` |
| DSH Web App | `@deepseek-ai/dsh-web-app@0.1.2-alpha.4` |
| Cordis | DSH vendored `@deepseek-ai/cordis@4.0.2` |
| DSH Node 要求 | `^22.19.0 || >=24.0.0` |
| DSH 包管理器 | `pnpm@11.7.0` |

以上版本、源码证据和真实安装路径已经核对。2026-09-02 使用 Node
`22.23.1`、pnpm `11.7.0`，在隔离的临时 `DSH_HOME` 中完成源码构建、npm
tarball 打包、DSH Web Profile 初始化、插件安装和浏览器运行验证；没有读取或改写
用户的真实 Profile。验证覆盖鉴权后的 WebUI、revisioned config、Host 生命周期、
在线/离线权威分离和存储初始化，随后在桌面、窄屏、暗色三种环境运行 24 项
Playwright 基线，全部通过。

alpha.4 包若仍处在 pnpm 的 24 小时发布时间门禁内，可在明确核对版本后临时设置
`LIANGXIANG_ALLOW_FRESH_DSH=1`。该开关只让 smoke 命令为本次临时 Profile 传入
`minimum-release-age=0`，默认关闭，不能进入安装文档或正式发布流程。
使用时直接执行 `LIANGXIANG_ALLOW_FRESH_DSH=1 bash scripts/smoke-clean-profile.sh`；
clean-profile 在 Host 启动前默认强制本地后端，只有显式提供
`LIANGXIANG_SMOKE_BACKEND_URL` 才会接触社区服务。
脚本在创建任何 Profile 前校验 Node `^22.19 || >=24` 与 pnpm `11.7.0`，不满足时
直接失败，避免用默认旧工具链制造伪兼容结论。

## 触点与稳定性

路径均相对 `../deepseek-harness`；“公开”表示从发布包入口导出或由当前包文档
明确描述，不表示 Developer Preview 期间承诺向后兼容。

| 梁相触点 | 分级 | alpha.4 源码证据 | 当前结论 |
|---|---|---|---|
| 客户端 `Context` / `ctx.slots` | 公开包类型 | `packages/client/ui-renderer/src/client/index.ts`：Cordis `Context` augmentation、`UiRendererService`、`apply`; `packages/client/ui-renderer/src/client/registry.ts`：`SlotRegistry.inject` / `register` | 旧 `dsh-client-runtime` 已删除；从 Cordis 导出 Context，并 type-only 导入 `@deepseek-ai/dsh-client-ui-renderer/client` 激活增强 |
| `shell.overlay` | 公开、文档化槽位 | `packages/client/ui-layout/src/client/index.ts`：`SlotMap['shell.overlay']` 及 root children declaration；`packages/client/ui-renderer/src/client/registry.ts` 的槽位说明 | additive、root-scope 的 frame-wide 浮层；`overlay-slot.ts` 仅 type-only 导入 layout 的槽位增强 |
| `sessionProjections` | 公开服务 | `packages/session/session-projection/src/index.ts`：`ProjectionChangeListener`、`SessionProjectionRegistry.onChanged`、`snapshot` | change feed 给出整个当前 view；snapshot 是同一 log cursor 的一致切面 |
| `sessions` / route metadata | 公开 Session API | `packages/core/session/src/index.ts`：`Session.firstLiveSeq`、`SessionStore.list`、`Session.requestHeader`、`Session.requestContext`; `packages/core/session/src/types.ts`：`EpochHeader`、`RequestContext` | `firstLiveSeq` 运行时仍是 number；`config.model` / `model` 是精确 route id，不是显示名 |
| `webServer.register` | 公开服务 | `packages/host/webserver/src/index.ts`：`WebRoute`、`WebServer.register` | `exact` / `prefix` 形状和 disposer 仍匹配 |
| `storageDomain.open` | 公开服务 | `packages/storage/storage-domain/src/index.ts`：`DomainFacility.open`; `src/spec.ts`：`DomainSpec`; `src/domain.ts`：`KvTable`、`Domain` | 当前结构适配覆盖 get/entries/put/delete/table/close；新增可选 spec 字段不破坏梁相 |
| `tokenUsage` 四桶 | 公开投影 | `packages/llm/token-meter/src/projection.ts`：`TokenUsageProjection`; `src/usage-projection.ts`：`bucketsFrom`、`tokenUsageProjectionDefinition`; `packages/llm/llm/src/types.ts`：`TokenUsage` | 四桶互斥；reasoning 已包含在 output；当前归一化正确，但累计值不保证单调，见下节 |
| 浏览器共享模块表与 loader wrapper | **源码级内部缝，最易破** | `packages/client/web/src/platform.ts`：`PLATFORM_MODULES` / `PRELOADED_CLIENT_EXTERNALS`; `packages/client/tsdown.client.ts`：`clientConfig` | 必须逐版本镜像并审计产物；不能视作公共 ABI |

梁相把 Host 服务收敛为 `src/compat/dsh/host-services.ts` 的最小结构面，以减少
直接依赖和把不稳定性关在单一边界内。结构适配不是凭空猜测：每个成员必须能在
上表的当前导出符号中找到。客户端的 renderer/layout 则使用发布包 `/client`
type-only 入口，使 declaration augmentation 在类型检查时生效且不产生运行时
`require()`。

## Token 口径与投影语义

alpha.4 的 provider `TokenUsage` 定义四类互斥输入/输出桶：

```text
input_tokens_total
= uncachedInputTokens + cacheReadTokens + cacheWriteTokens

effective_tokens
= input_tokens_total + outputTokens
```

- `inputTokens` 在 provider 层是 uncached input；投影字段名为
  `uncachedInputTokens`。
- `reasoningTokens` 是 `outputTokens` 的子集，绝不二次相加。
- `tokenUsageProjectionDefinition.stateVersion` 当前为 `2`。
- 同一 attempt 的 usage chunk 是早期样本；最终 `assistant/message` 样本替换它，
  不重复累计。
- `llm/retry-started` 关闭旧 replacement slot，因此下一次 retry 的已计费 usage
  会另行累计。
- replay、snapshot 和 `onChanged` 都提供完整累计值，不是增量。

### OPEN：最终样本下调与不可逆 HWM

`packages/llm/token-meter/README.md` 明确说明：最终样本可以修正较早 chunk，
所以累计投影 **不保证单调**。梁相当前 `src/host/usage-ledger.ts` 对每个桶保存
max-HWM；它能去除相同 replay，却不能撤销已经产生的信用。

例如先观察 `input=10, output=2`，最终被修正为 `input=8, output=1`，当前账本会
保留 12，而真实最终累计是 9。这是潜在多计，不得再描述为“下降方向安全”。
标准 DeepSeek/pi-ai 路径通常只在终态产生 usage，因而不代表公共契约下风险消失。

在修复前必须遵守：

1. 不把 max-HWM 写成已证明正确的最终结算模型。
2. 不用任意 debounce 冒充 attempt 已结算。
3. 首选在明确的 attempt/step 结束边界读取 projection snapshot，再产生不可逆
   Token 信用；projection 仍是数值权威，原始事件只作为结算边界。
4. 回归测试必须覆盖“chunk 较高、final 下调”的序列。

另一个独立且有意保守的行为：没有持久化 HWM 的已恢复 session，其首次累计值
会作为 baseline，以免把旧历史重新铸香。这可能少计恢复后第一次观察前的使用，
但不会多计；不要与 final downward replacement 风险混为一谈。

## 浏览器 bundle 基线

alpha.4 的精确 `PLATFORM_MODULES` 是：

```text
react
react/jsx-runtime
react-dom
react-dom/client
@deepseek-ai/cordis
@deepseek-ai/dsh-client-store
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
```

`PRELOADED_CLIENT_EXTERNALS` 当前为空。客户端包装仍为：

```js
window.__ModuleLoader__.load({ id, factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  // bundle
  return module.exports
} })
```

这两项是从 DSH 树内构建 preset 得到的内部兼容缝。升级时必须重新比较源码，
并检查梁相产物里的每个 `require(...)` 都能由共享模块表回答；不得保留已删除的
`@deepseek-ai/dsh-client-runtime/client`，也不得假设未列出的 DSH value import
会自动由宿主提供。

当前六张梁子图使用 lossless WebP 内联，仍保持 DSH 所需的单一 `client.js`。
构建预算固定为 raw 不超过 700 KB、gzip 不超过 400 KB；像素等价、透明通道和
256×256 尺寸由测试守护。2026-09-02 的合规运行验证同时覆盖 bundle 实际装载，
不是只检查静态 external 列表。

## 已知权威边界

- 本机 `sessionProjections` 是 Host 可读投影，不是社区后端可验证的 Token authority。
- `anonymous-user-id` 或安装 ID 不是认证身份。
- Context Occupancy、启发式 token estimate 和 UI 文本都不得用于投票信用。
- DSH 网络中断、重连或 replay 不得触发在线/离线账本互相迁移。

## 每次升级 DSH 的完成条件

1. 记录新的 npm 版本、tag、完整 commit、Node 和 pnpm 要求。
2. 重读上表每个精确 path/symbol；删除不存在的类型增强和包引用。
3. 比较 `packages/client/web/src/platform.ts` 与
   `packages/client/tsdown.client.ts` 的 `clientConfig`。
4. 核对所有 provider adapter 的 usage 桶，以及 token-meter 的
   chunk/final/retry/replay 语义。
5. 运行 `pnpm run verify`、`pnpm run smoke:browser-clean-profile`、在线真实后端
   冒烟和客户端 bundle external 守卫；必须使用满足该 DSH 版本要求的 Node/pnpm。
6. 只有运行验证实际完成后，才把“源码审计”升级为“实测兼容”。

梁相不修改 `../deepseek-harness`，也不从模型记忆猜测 DSH API。
