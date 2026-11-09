# COMPATIBILITY — DSH 兼容性权威证据

源码兼容基线最后核对：2026-11-08。DSH 仍是预稳定 API；所有不稳定触点只在
`src/compat/dsh/` 内适配，不修改上游源码，不凭版本号宣称永久前向兼容。

## 当前候选

| 项 | 当前事实 |
|---|---|
| 梁相版本 | 2.0.1-alpha.2 |
| 状态 | 未发布修复候选；沿用2.0.0的DSH基线，公开版仍为2.0.0，本轮不部署正式后端 |
| DSH CLI / Web App / UI renderer/layout/slots | 0.2.1-rc.2（同一版本） |
| DSH tag / commit | dsh-v0.2.1-rc.2 / 687f282e86 |
| Cordis | 4.0.5 |
| Session 持久化格式 | 4，取自 SessionHeader.version |
| 验证运行时 | Node 22.23.1 / pnpm 11.28.5 |
| 上游源码工具链 | Node ^22.19.0 或 >=24；pnpm 11.28.5 |

### 当前默认宿主的独立短冒烟

2026-11-08核对，DSH npm `latest`／`next`已为 **0.2.2-rc.1**，源码
[`66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1)，
要求Node **>=24.9.0**、Cordis4.1。上表仍是本仓锁定的完整回归基线，不为赶发布替换整套开发依赖。

2.0.0候选已在独立Node24.9.0／DSH0.2.2-rc.1真实安装，9份运行资源与给定tarball一致；
主面板和梁祠打开、梁股隔离展示及会话适配可用性共6项通过，浏览器错误0。
`accounting.available=true`、无适配告警，真实Session格式仍为4。未配置API Key或发起
provider请求，**不把短冒烟记作最新版真实Token到账验证**；固定基线的凝香／重放门禁与
当前适配单测另行保留。音效等后续变更须再核对最终客户端产物，不能用早先包替代冻结包。

源码比对确认本插件使用的`Session.snapshotEvents`、`firstLiveSeq`、`session/event`、
`requestHeader/requestContext`及`shell.overlay`触点仍存在；观察器未注册会话投影，
不因异步投影注册变化直接失效。`usageOf`四桶及最终message／attempt语义保持，默认路由仍为
`deepseek-flash`（显示V4.1-Flash）与`deepseek-v4-pro`，静态×0.5／×1无需修改。
证据：[Session](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/session/src/index.ts#L728)、
[用量](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/token-meter/src/usage-projection.ts#L79)、
[模型](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/llm/llm-deepseek/src/models.ts)。

0.2.2提供第三方npm注册表插件的详情版本更新与失败恢复；不是所有tgz、Git或别名来源都具备
更新按钮。当前安装说明按版本与来源区分，不再把0.2.1旧入口限制泛化至最新版，见[安装指南](INSTALL.md)。

2026-10-19 发布前复核，DSH CLI 的 npm `latest` / `next` 均为 0.2.1-rc.2；
Web App、renderer、layout、slots 的 `next` 同为 0.2.1-rc.2，`latest` 仍是各自旧号。
开发依赖与临时 Profile 使用明确的同版候选号，避免混装；CLI 前一默认版本
0.2.0-rc.2 也已完成同一安装包回归。正式用户安装指引不因此改为预览标签。

## 接口与源码证据

下表路径均相对 `../deepseek-harness`，commit 687f282e86。

| 触点 | 精确证据 | 稳定性与处理 |
|---|---|---|
| Cordis Context / ctx.slots | client/ui-renderer/src/client/index.ts、registry.ts | 公开包类型；renderer 的 /client type-only 导入激活增强 |
| shell.overlay | client/ui-layout/src/client/index.ts 的 SlotMap 和 root children | 公开列表槽位，注册与 inject 随 fiber 释放 |
| Session 生命周期 | core/session/src/index.ts 的 Session.snapshotEvents、firstLiveSeq、header、session/event、SessionStore.list | 公开接口；先读一次历史，随后逐事件 fold，不保存消息正文 |
| 请求用量 | core/session/src/types.ts 的 assistant/message、assistant/attempt；llm/llm/src/assistant-stream.ts；llm/token-meter/src/usage-projection.ts 的 usageOf | 当前持久化流内嵌；message.usage 优先，否则读 stream 最后一个 usage chunk |
| 重试边界 | llm/llm-retry/src/types.ts，core/agent-loop/src/agent.ts | assistant/attempt 结算无消息的失败/取消尝试；retry-started 开启下一尝试 |
| 实时活动 | 同版 `@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts` 的 agent/assistant-stream、agent/status、agent/disposed；`agentEvents` 和 AgentLoop 的 AssistantStreamAttempt | 公开事件但预稳定；隔离在 streaming-activity 适配器。仅取 agent 对象及帧 type/attemptId/revision，不读 chunk；状态翻转才推送本机布尔标志，不接入用量结算 |
| 同源路由 | host/webserver/src/index.ts 的 WebServer.register / WebRoute | exact/prefix + handler 的最小结构面不变 |
| 存储 | storage/storage-domain/src/index.ts、spec.ts、domain.ts | open、table、get/entries/put/delete/close 的结构面不变；可选字段向后兼容 |
| 初始停靠 | 0.2.0-rc.2 / `639ed01539` 与 0.2.1-rc.2 / `687f282e86` 的 packages/client/ui-settings-account/src/client/AccountMenu.tsx | 内部 DOM seam，仅读取可见底部账户按钮一次，在首帧前给新位置保留 8px；无观察器/追随，不覆盖已保存位置 |
| 浏览器包装 | client/web/src/platform.ts、client/tsdown.client.ts | 内部兼容缝；每次升级重审计，并检查实际 bundle 的 require |

## 用量和迁移

输入 = 未缓存输入 + 缓存读 + 缓存写，四桶互斥；reasoning 已包含在输出。
Effective Token = Input + Output。Pro ×1，Flash/其他/未知 ×0.5；规则、
模型族匹配与提示同源，服务端不接收模型名。详见 `INCENSE_POLICY.md`。

当前 DSH 不再把流式 assistant/chunk 写入持久化日志。成功请求通过
assistant/message，失败/重试/取消且无可见消息的请求通过 assistant/attempt
提交 compact stream；usage 仍以最后服务商样本为准。兼容层继续读取旧持久化
chunk/final/retry 序列，但真实观测只在尝试结束时铸香。

会话格式升级可能重排日志偏移。结算 watermark 新增可选 sessionFormat，
与 settledOffset / baselineOffset 一起持久化；发现格式改变时以当前历史建立
基线，保留原有香火和 HWM，下一次新请求正常计入。不同格式的偏移不取 max。
该保守迁移可能略过升级期间一次未补记请求，不能把旧历史再次铸香。

无游标的恢复/借用前缀建立 baseline；有匹配格式游标则补未结算请求，昨日请求
不灌入今日。在线/离线账本隔离，只共享结算水位；网络故障不会切换模式。

## 浏览器构建

当前 PLATFORM_MODULES：react、react/jsx-runtime、react-dom、react-dom/client、
@deepseek-ai/cordis、zod、@tanstack/react-virtual、@deepseek-ai/dsh-client-store、
@deepseek-ai/dsh-client-ui-slots、@deepseek-ai/dsh-client-ui-primitives、
@deepseek-ai/dsh-client-ui-dockkit。PRELOADED_CLIENT_EXTERNALS 仍为空。

tsdown.config.ts 镜像上述共享模块，保持
window.__ModuleLoader__.load({ id, factory }) 和 CJS factory 包装。
插件运行时只要求自己实际导入的共享模块；新增平台模块不会凭空成为旧宿主依赖。
本批压缩空白和内部变量名，显式保留 module/exports/require；check:client-budget
还执行构建产物的工厂并核对插件导出，避免格式漂移。真实 Profile 将服务的 combo 与构建产物
比较；只按 client/modules/src/index.ts 的 prepareSource 去掉 sourceURL/sourceMappingURL
尾注（已核对同一 commit），不依赖引号或缩进形式。
原梁子图像继续内联 lossless WebP，鲸鱼素材单独按需加载；单 client.js 预算为 raw ≤725 KB、gzip ≤430 KB。

上香与香火交易共用 `src/client/request-id.ts`，依次使用 `crypto.randomUUID`、
`crypto.getRandomValues` 和普通随机兜底生成幂等请求号；请求号不是秘密，
普通随机不得用于安装密钥或签名。局域网HTTP不保证提供 `randomUUID`，
localhost的成功不能代替非安全上下文回归；同一未确认意图仍复用原请求号和请求体。

## 验证边界

徽标与 DSH 适配的验证见 `PR6_REVIEW.md`；PR #7 的漏算回归、会话迁移/重启及 CI 处理见
`PR7_REVIEW.md`；小难梁增量验证见 `ISSUE2_IMPLEMENTATION.md`。类型检查通过
不代表安装/浏览器兼容；只有完成的真实 Profile、localhost Backend 和浏览器
检查才记为已验证。未来未知 DSH 版本仍需重读接口并重复相关验证。

旧正式版 1.1.6 的历史安装基线为 DSH 0.1.2-alpha.5 / db6bdc3576，另实测过
npm 无标签解析的 0.1.1-rc.2。该正式包仍有累计 max-HWM 的中间样本多计风险；
本次候选修复不会追溯扣除历史香火，也不意味着社区生产服务已经更新。

社区身份和 Token 仍为 A3 软信任：安装密钥证明持钥连续性，不能验证 Token
真实来源；浏览器余额、Context Occupancy 和估算值永远不是投票权威。

## 日终设置兼容

rc.7 复用现有公开 `storageDomain` 设置表与 Host 路由，未新增 DSH API 或依赖。
已按同一 DSH commit 的 `storage/storage-domain/src/spec.ts`（DomainTableSpec）和
`index.ts`（DomainFacility.open 的 valueSchema.parse）复核，新增设置行保留旧
authorityPreference 字段。Host/Client 的 dayEnd 偏好为 additive 可选字段，旧 Host
不提供时关闭新入口；Backend API 不增加字段，按其 server_time/业务时区安排本机
定时，最终扣香仍由原有签名投票接口决定。具体行为见 `DAY_END_INCENSE.md`。
