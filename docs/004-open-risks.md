# 004 — 开放风险与未决问题

基线与分级见 [`docs/000`](000-dsh-reference.md);触点编号(H*/C*/B*)见 [`docs/003`](003-compatibility-matrix.md)。每项:影响、现状判断、缓解、观测点/触发条件。

## R-1 DSH 预发布,无兼容承诺(总项)

- **影响**:全部触点。DSH 根 AGENTS.md 明文首个 tagged release 前自由重命名/重打包、盘上格式可拒旧。
- **缓解**:全部触点收敛 `compat/dsh`(每触点一个函数);`docs/000` 重勘察清单在每次 DSH 升级时强制执行;账本自带格式版本号,拒读不识别版本而非静默迁移。
- **观测点**:升级后跑 000 清单 10 项;梁标自身冒烟(加载、注册、记账、端点)。

## R-2 浏览器 bundle 包装格式需树外复刻(C6,最大单点)

- **影响**:`window.__ModuleLoader__.load({id, factory})` banner/footer 与 externals 集来自树内 `packages/client/tsdown.client.ts`,该 preset 不作为 npm 包发布;格式漂移会让 `lib/client.js` 静默无法登记(或 404/执行报错)。
- **现状**:加载器行为半公开(`packages/client/modules` README + `docs/subsystems/client-modules.md`),格式本身无独立规范文档。
- **缓解**:包装复刻隔离在本包 `tsdown.config.ts` 一处;构建后冒烟断言(启动 `dsh web` 后 `GET /plugins/dsh-liangbiao/client.js` 200 且浏览器 boot 报告无该 entry 失败);升级 DSH 时 diff `tsdown.client.ts`。
- **可上游贡献的最小建议**:请求 DSH 把 `clientBundle` preset(或至少 banner/footer 契约)以包形式发布/成文——单文件导出即可,树外插件生态的共同需求。

## R-3 `shell.overlay` 尚无第一方占用者

- **影响**:座位契约明确(公开 JSDoc)但生产验证为零(catalog `occupants: []`);与 body-portal 的 Toast/Modal(`ui-primitives`,z-index 各自为政)的层叠关系、与 `details` 右栏开合的避让,均无先例可抄。
- **缓解**:实现期做视觉回归(明/暗 × details 开/关 × 窄窗口);z-index 只依赖 overlay 层自身(`z-index:20`),条目不自行拔高;避让 composer/导航是冻结 UI 需求,进验收清单。
- **观测点**:DSH 若给 `shell.overlay` 引入第一方占用者或改层样式(`AppFrame.module.css`),对齐其姿态。

## R-4 compaction 用量的口径缝隙(H17)

- **影响**:compaction 摘要通过直接 `ctx.llm.stream()` 调用,不在会话日志中追加自身 usage 事件(token-meter README 明文),`compaction/summary.usage` 字段也不进 `tokenUsage` 折叠——该部分真实 token 消耗**不会**产生梁气。
- **判断**:与第一方 token-meter 口径一致,v0.1 接受(少计方向,不会多铸)。
- **触发条件**:若产品层要求"目标模型全部用量都算",需在方案 A 折叠器中显式加计 `compaction/summary.usage` 并重审去重(它无 `(turn,step)`)。

## R-5 fork/基线化的残余语义

- **影响**:基线化(R3)防住父前缀双计,但也意味着:插件安装前、或梁案基线建立前的用量一律不计(冻结需求,符合);父子会话并行活跃时两边的**新**用量都计(真实消耗,正确)。
- **未决**:同一物理请求被上游重试导致日志出现两个 `(turn,step)` 样本时视为两次消耗——DSH 日志无更细的请求指纹,接受。
- **观测点**:`header.parentSession`/`seedLength` 语义变化。

## R-6 本地 HTTP 端点的信任面

- **影响**:`ctx.webServer.register` 注册的 `/liangbiao/api/*` 与 DSH WebUI 同端口;DSH 对 `/api` 有统一信任检查(`docs/api-gateway.md`),但自注册路由的鉴权姿态需在实现期核对 `dsh-host-webserver` 的 carrier 语义——本地其它进程理论上可调用投票端点。
- **判断**:token→梁签本就是软信任社区机制(项目 AGENTS.md 明文),本地伪造只影响本机账本;香火统计的防滥用属未来后台职责。
- **缓解**:实现期核对 webserver 信任检查是否覆盖自注册路由;投票端点仅消耗本地梁签,天然限额。
- **红线**:任何文案不得宣称记账/投票具有密码学保证。

## R-7 结算窗口的崩溃丢失(R8)

- **影响**:pending 中尚未定格结算的 `(turn,step)` 样本在 Host 崩溃时丢失,少计一次贡献(不会多计——水位只在结算时推进)。
- **判断**:方向性安全(宁少勿多),接受;不为此引入每事件落盘。
- **观测点**:若用户反馈梁气明显少于预期,检查结算频率。

## R-8 方案 B 的粒度退化

- **影响**:ANY_DSH_USAGE 口径下差分粒度为投影变更,per-request cap 退化为 per-变更 cap;且依赖 token-meter + session-projection 挂载。
- **缓解**:口径入梁案配置并在 UI 如实展示;两插件缺席时显示"记账不可用"但徽章仍渲染(冻结需求 9)。

## R-9 root scope 无 `useProjection`(已消化的设计约束)

- **现状**:root 座位标准席位仅 `useSessions`/`useWorkspaces`(C4);梁气数据全部走自建通道(H12+C3),不是风险而是已定型约束;记录在案防止实现期误用会话投影。

## R-10 开发环摩擦

- Host 半无热重载(改动需重启 `dsh web`);Client 半依赖自跑 `tsdown --watch` + HMR(B3,半公开,仅开发)。接受。

## R-11 隐私红线核对清单(实现期验收用)

- [ ] 折叠器不持久化任何事件 payload(仅计数与 seq 水位)
- [ ] wire 快照/日志/错误信息不含 prompt、输出、代码、文件路径、密钥、原始 token 历史
- [ ] 匿名安装 id 自铸,不读取 `.anonymous-user-id`,不与 telemetry 关联
- [ ] 出站网络 v0.1 为零;future backend 仅投票与聚合计数,带超时/取消/有界重试/幂等键
- [ ] 不提交任何真实 endpoint/凭据

## R-12 未决产品问题(非 DSH 技术项)

1. v0.1 活跃梁案的来源:无后台时梁案(id、`tokensPerBallot`、cap、口径、目标路由集)只能内置默认或本地配置;未来后台梁案接入时的 id 衔接与"梁案变更即重置"的迁移体验待定。
2. 目标路由集的默认值(哪些 provider/model ID 算"梁"的目标模型)需产品拍板;技术上仅支持精确 ID 匹配。
3. 香客(独立安装数)在无后台时只能显示缓存/占位,首版文案待定。

## 上游贡献建议(最小化)

按优先级:

1. **发布 `clientBundle` 构建 preset 或 bundle 包装格式规范**(消解 R-2;单文件/单页文档即可)。
2. `shell.overlay` 增加一个第一方最小占用者或 e2e 快照(消解 R-3 的无先例状态)。
3. 长期:树外 `@Remote` 支持(消解自建通道;DSH 侧已有 `docs/000` 重勘察项 10 跟踪)。

本阶段结论:**存在可用的全局 UI Slot(`shell.overlay`),无需为放置梁标做任何上游修改。**
