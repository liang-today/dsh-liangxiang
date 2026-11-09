# 梁相：当前架构与事实索引

核对：2026-11-09。先读 [`AGENTS.md`](../AGENTS.md)，再按本文进入专题；历史文档不能覆盖现行契约。

## 版本与边界

当前源码 `package.json` / `PLUGIN_VERSION` = `2.0.1-alpha.12`，`SERVER_BUILD=2.0.1-alpha.12-u1`。3999按用户授权原位更新本批钱包与三列香池排布，保留私有120秒模拟控件、身份、资金与仓位。原香港隔离演练已只读一致复制到本机独立环回实例，沿用alpha.4-u1／schema15与原暂停时钟，不升级或迁移；3999不再依赖待退订轻量机。正式后台未动。这仍是新客户端配旧后台的兼容手测，不替代同候选完整验收，见[`PLANT_ACTIVITY_BALANCE.md`](PLANT_ACTIVITY_BALANCE.md)。
当前源码为 **2.0.1未发布修复候选**，保留Host断线行情恢复与源码资源兜底，并统一浏览器读取预算、中文网络提示和断读后的恢复；不改行情刷新节奏、正式账本或历史行情。请求预算与前批验证见 [`CLIENT_REQUEST_RECOVERY.md`](CLIENT_REQUEST_RECOVERY.md)；上一轮同版演练见 [`SAME_CANDIDATE_RECOVERY.md`](SAME_CANDIDATE_RECOVERY.md)，此前等待与本机测试控制见 [`CLIENT_POND_LOADING.md`](CLIENT_POND_LOADING.md)，本批水草凝香及支出余香见 [`PLANT_ACTIVITY_BALANCE.md`](PLANT_ACTIVITY_BALANCE.md)。2.0.0已于2026-11-09公开发布；正式后端仍为2.0.0-u1／schema15／`a90d0e9`，本分支不部署正式服务。此前1.3候选未正式发行。候选提交、社区合并与正式发布／部署是独立步骤，不能由源码版本推断线上已升级。
公开快照的纯代理CORS维护单独记录`PROXY_VERSION`；社区main前移不代表后台应用已重部署，不以该差异触发应用更新。
本批客户端、最终包、音效、当前DSH及文案待审状态见[2.0候选验收](RELEASE_2_READINESS.md)；1.2记录不作为2.0放行依据。

累计钱包、三批分池、延迟定梁与缓存限制的契约见 [`MARKET_WALLET.md`](MARKET_WALLET.md)，候选SQLite schema 为 **16**，只给档案元数据新增重置游标，迁移不改钱包、仓位、用量或成交回执；正式后台仍为schema15，本轮不部署。独立实现与验证证据见 [`MARKET_VALIDATION.md`](MARKET_VALIDATION.md)。下述11月3日维护版是历史记录，不代表当前正式部署。

2026-11-03 后台维护：公开客户端/npm/官网仍为 1.2.0；服务为 **1.2.0-u2 / 2f2d6e3**，
源自正式 1.2.0，只调整社区额度并修复部署权限，不带入候选 schema 11。
部署一致性检查须对照该后台维护分支；不能因未发布候选 HEAD 不同就擅自部署候选。

| 仓库 | 职责 |
|---|---|
| `dsh-liangxiang` | 插件、Host、Client、社区 Backend |
| `liang-xiang-page` | 官网与安装指南，独立 Git、构建与提交 |
| `deepseek-harness` | DSH 源码证据，只读，不为梁相打补丁 |
| `promo-video` | 宣传工程，非 Git，不作为产品事实源 |

DSH 固定为 **0.2.1-rc.2** / `687f282e86`；原兼容性基线为 Node **22.23.1**、pnpm **11.28.5**，2.0候选另在受支持的 Node **22.19.0** 与同版pnpm验证。
公开使用的兼容要求与精确触点见 [`COMPATIBILITY.md`](COMPATIBILITY.md)。
2026-11-08另用Node24.9.0／当前默认DSH0.2.2-rc.1完成独立真实安装及6项界面／适配短冒烟；未进行真实provider用量请求，不替代固定基线完整凝香回归。最终音效及窄屏提示差异已在三主题实包6项验收，准确产物与边界见2.0候选验收。

本批审查加固与漏测复盘见 [`RELIABILITY_REVIEW.md`](RELIABILITY_REVIEW.md)。候选收紧跨钥匙恢复：设备指纹不是旧钥匙证明，丢失身份文件后需恢复原凭据，或由管理员核实空钱包后解绑；不再自动废除另一把钥匙。

## 权威数据流

```text
DSH 最终请求用量
  → compat/dsh 观察与持久化游标
  → Host 按请求路由折算 Pro 当量
      ├─ 在线：签名声明 → Backend / SQLite 累计钱包与事务记账
      └─ 离线：独立本地账本
  → 云端 SSE → Host → 同源 HTTP + SSE → 今日梁案 / 香火环 / 梁祠 / 香火交易
```

- 在线 Backend 决定扣香、幂等票据、唯一香客、聚合与快照；浏览器只发送意图。
- 社区仍为 `DEV_STAGING_ONLY` 软信任：安装密钥不等于实名身份，Token 是 Host 声明，不是可验证生产票权。
- 在线与离线分别保存身份投影、香火、投票、梁案和档案；共享已结算会话游标以避免同一用量重复凝香。
- 梁位、梁子与统计来自同版权威快照。网络失败保留在线偏好、锁票并自动重连，不静默切换模式。
- 不保存或传输提示词、回复、源码、会话正文或原始文件路径；Backend 不接收模型名。
- 自动上香的本机夯/拉统计由 Host 按模式持久化，页面与手动记录合并展示；Backend v11 的原始成交回执用于丢回执后的准确重放，不改变投票额度。
- 实时请求活动是独立的 Host → Client 布尔信号，只在开始/结束翻转推送；不读取块正文、不估算数字、不写账本或发送至社区。水草附近的泡泡沿实际水深上升、在水面破开；无水／极薄水层只留环底呼吸光。持续活动不覆盖今日凝香；确认结算短显到账与余香，已确认上香支出也短显个人余香。详见 [`PLANT_ACTIVITY_BALANCE.md`](PLANT_ACTIVITY_BALANCE.md)。

## 当前产品行为

| 功能 | 最终规则与资料 |
|---|---|
| 累计钱包（候选） | 可用/冻结分离；首次新版协议接入前仍按日清零，仅承接启用当日真实余额与余量；启用后跨日累计且不可降回日账，同身份旧请求给出明确升级保护。共用唯一钱包，见 [`MARKET_WALLET.md`](MARKET_WALLET.md) |
| 香火交易（候选） | 主面板梁股直达；每日三批延迟定梁、午夜共同收盘。默认官方分钟数据聚合烛线，全天持续记录；浅灰待开梁区从当前时间线开始，顶部细带标记投入时段。单一时间窗随缩放变化，自动匹配真实粒度；潮汐、分列读数、缩放／平移／全屏保留；点位明细随鼠标，早午晚盘的持仓／封盘时刻和底栏香池常驻，顶部显示业务时间和个人可用。确认与撤回同栏，大肥鱼按操作及每分钟播报。新场07–11／12–16／17–21各四小时投入、12／17／22定梁，旧v1/v2场保留原时点。现行视觉见 [`MARKET_UI_COMPARISON.md`](MARKET_UI_COMPARISON.md) |
| 小难梁 | 有票且梁位 <25%；25%–<50% 为梁工。旧梁案和档案保留原规则，见 [`ISSUE2_IMPLEMENTATION.md`](ISSUE2_IMPLEMENTATION.md) |
| 凝香 | Pro ×1；Flash、其他及未知 ×0.5；按每个请求最终用量结算。V4.1 路由与重试/迁移边界见 [`INCENSE_POLICY.md`](INCENSE_POLICY.md)、[`PR7_REVIEW.md`](PR7_REVIEW.md) |
| 拍梁子 | 单击 200ms 判定开合；双击/连拍保持面板状态。主面板固定，独立三行短句下落渐隐，见 [`PR6_FEEDBACK_REDESIGN.md`](PR6_FEEDBACK_REDESIGN.md) |
| 定时上香 | 默认关闭，满 500 炷后每 10 分钟按限额上香，23:59 再收尾一次；复用原开关/方向，旧开关需重新开启，手动优先、意图持久化且不跨日补投，见 [`DAY_END_INCENSE.md`](DAY_END_INCENSE.md) |
| 连接 | 候选优先每 Host 一条云 SSE；健康时低频校准、旧后台或故障回退 cadence；浏览器复用本机 SSE。已发布版的原轮询基线见 [`CONNECTION_EFFICIENCY.md`](CONNECTION_EFFICIENCY.md) |
| 更新说明 | 仅展示当前版相对上次正式版的一份说明，不补播历史；最高已读版本防止旧版自动弹出，可从案牍主动重看。保留首次指导、QQ 二维码及鸣谢 |
| 本机观察数据 | 保留 Host 每秒采样、1 分钟成桶、按日存储和只读出图接口；缺口不补、换案断开。本机观察不混入市场官方数据或结算；案牍统一进入香火交易。数据契约与旧独立界面说明见 [`LIANGXIANG_BARS.md`](LIANGXIANG_BARS.md) |

投票额度默认每分钟恢复 500 炷，桶容量与单次请求仍各最多 500 炷；定时上香保持 10 分钟。
凝香速度核对结论与未核验边界见 [`INCENSE_AUDIT.md`](INCENSE_AUDIT.md)。
梁小号保留称号展示，不再响应点击、悬停或键盘聚焦弹出解释。

Desktop 通过原生“插件 → 添加插件”输入完整包名 `dsh-liangxiang` 安装；命令行 WebUI 独立管理 Profile。安装图解、升级和卸载见 [`INSTALL.md`](INSTALL.md)。
插件市场的搜索卡片／详情来源、主UI／梁股／梁祠三图准备与渠道优先级见 [`PLUGIN_MARKET_DISTRIBUTION.md`](PLUGIN_MARKET_DISTRIBUTION.md)；每次正式发布重新核实，不由README更新推断所有市场已同步。
在线一直连不上时先排查 DSH Host 到社区的网络；部分地区可尝试代理，见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。

## 实现位置

- `src/domain/`：纯业务规则、倍率、梁位与档案聚合。
- `src/shared/`：Host、Client、Backend 的 wire 校验及版本。
- `src/compat/dsh/`：DSH 接口、请求用量、存储与升级适配的唯一接触层。
- `src/host/`：结算、持久化、模式、定时上香排期、同源路由与生命周期。
- `src/client/`：交互与展示，不持有余额或投票权威。
- `src/client/request-id.ts`：上香与市场共用的浏览器幂等请求号生成器；兼容局域网HTTP，普通随机兜底不用于密钥、身份或签名。
- `src/backend/`：HTTP、SQLite 事务、身份、票据、快照与梁祠。

存储使用既有 DSH storage domain。在线为 `liangxiang.json`，离线为 `liangxiang_local.json`；
走势是唯一例外，按业务日落 `storages/liangxiang-bars/days/<date>.json`（可重建的派生数据，坏文件只跳过）；
正常更新/卸载不删除账本。Backend 数据位于运维配置的 SQLite 文件，迁移和备份规则见 [`121-vps-deploy.md`](121-vps-deploy.md)。

## 验证与协作

当前多项工作与待审核建议逐项记在 [`WORK_TRACKER.md`](WORK_TRACKER.md)；每项完成即更新，不用旧验证记录推断新任务已完成。
社区PR #30同步、1.3版本冲突处理和HTTP兼容性漏测原因见 [`PR30_INTEGRATION.md`](PR30_INTEGRATION.md)。
主面板浅蓝水景的现行设计见 [`MAIN_PANEL_BLUE_UI.md`](MAIN_PANEL_BLUE_UI.md)；原有市场样稿的落实与验收边界见 [`MARKET_UI_ALPHA12.md`](MARKET_UI_ALPHA12.md)。
市场盘名、常驻投入／香池、业务时钟、点位浮层及紧凑金额的alpha10验证结果见 [`MARKET_UI_ALPHA10.md`](MARKET_UI_ALPHA10.md)。
DSH侧栏默认280px、梁相外框256px的实现与实测见 [`DSH_LAYOUT_WIDTH.md`](DSH_LAYOUT_WIDTH.md)；alpha8按最终反馈保持256px，新增梁股直接入口与紧凑统计，指针关闭失焦、键盘关闭归还焦点。

完成变更至少运行 `pnpm run verify`；DSH/打包触点运行 `smoke:clean-profile`，UI 运行
`smoke:browser-clean-profile`，权威/API 变化运行 `smoke:online`，提交和推送必须通过隐私门禁。
当前交易候选的验证证据集中记录在 [`MARKET_VALIDATION.md`](MARKET_VALIDATION.md)，
隔离演示步骤见 [`MARKET_LOCAL_TEST.md`](MARKET_LOCAL_TEST.md)，香港备服专用部署与加速签名演练见 [`MARKET_REHEARSAL.md`](MARKET_REHEARSAL.md)。
多客户端人工测试另用真实业务时钟、独立身份/数据库和出口IP白名单，固定部署及隔离规则见 [`INTERNAL_TEST.md`](INTERNAL_TEST.md)。
最新实际安装、人工环境及旧版原位升级的独立验收见 [`INTERNAL_TEST_READINESS.md`](INTERNAL_TEST_READINESS.md)；两分钟一天的演练不改真实时钟内测实例。
当前alpha8入口、回滚缓存故障注入及新12客户端三批派彩见 [`MARKET_REHEARSAL_ALPHA8.md`](MARKET_REHEARSAL_ALPHA8.md)；alpha7旧协议证据见 [`MARKET_REHEARSAL_ALPHA7.md`](MARKET_REHEARSAL_ALPHA7.md)；alpha5的DSH手工收盘历史保留在 [`MARKET_REHEARSAL_REPORT.md`](MARKET_REHEARSAL_REPORT.md)，均不作为并发容量结论。
[`RELEASE_READINESS_1_2.md`](RELEASE_READINESS_1_2.md) 仅保留 1.2 发布验收记录，不能代替当前候选检查。

个人 fork 从最新社区 main 开发并向 main 提 PR；三平台锁定依赖、隐私与完整安装、
浏览器及隔离在线检查均通过后由维护者审核合入。CI 使用只读权限，不重复运行 push 检查。
每批前后端开发通过相应验证后立即提交并推送个人fork功能分支暂存；这不授权社区合入、公开发布或部署。
dev 已在全部历史进入 main 后删除，本机远程跟踪引用已清理；不再自动晋级。
PR 必须来自作者本人的个人 fork、非默认功能分支；主仓禁止创建开发分支与直接推送。
普通账号自动运行 CI；新注册账号首次贡献仍受 GitHub 运行审批限制。
协作与 DSH alpha 预警以 [`CI.md`](CI.md) 为准，代码合入不授权发布或部署。

每次上线均需独立执行 `scripts/deploy-check.sh` 核实真实运行版本；不能从源码或 CI 成功推断生产已更新。
更换服务器、公网IP或入口线路时，必须先通过[中国大陆可用性门禁](121-vps-deploy.md#0-换服前置门禁中国大陆可用性)：
独立入口/测试库、多地三网与晚高峰、旧新对照、真实HTTPS和SSE及当期并发目标，先形成可审阅结论再按授权切换；
缺少证据或持续失败时不得直接切换正式流量，并须保留旧服、完整备份与单写者回退。
