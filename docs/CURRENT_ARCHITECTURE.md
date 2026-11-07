# 梁相：当前架构与事实索引

核对：2026-11-07。先读 [`AGENTS.md`](../AGENTS.md)，再按本文进入专题；历史文档不能覆盖现行契约。

## 版本与边界

当前源码 `package.json` / `PLUGIN_VERSION` = `1.2.2-beta.4`，`SERVER_BUILD=1.2.2-beta.4-u1`。
当前源码为 **1.2.2-beta.4 本地候选**；公开版本与部署状态须结合[发布验收记录](RELEASE_READINESS_1_2.md)、GitHub Release、npm 与实际服务核对，不能由源码版本推断。候选提交、CI 合并与正式发布/生产部署是独立步骤。

2026-11-03 后台维护：公开客户端/npm/官网仍为 1.2.0；服务为 **1.2.0-u2 / 2f2d6e3**，
源自正式 1.2.0，只调整社区额度并修复部署权限，不带入候选 schema 11。
部署一致性检查须对照该后台维护分支；不能因未发布候选 HEAD 不同就擅自部署候选。

| 仓库 | 职责 |
|---|---|
| `dsh-liangxiang` | 插件、Host、Client、社区 Backend |
| `liang-xiang-page` | 官网与安装指南，独立 Git、构建与提交 |
| `deepseek-harness` | DSH 源码证据，只读，不为梁相打补丁 |
| `promo-video` | 宣传工程，非 Git，不作为产品事实源 |

固定验证环境：DSH **0.2.1-rc.2** / `687f282e86`，Node **22.23.1**、pnpm **11.28.5**。
公开使用的兼容要求与精确触点见 [`COMPATIBILITY.md`](COMPATIBILITY.md)。

## 权威数据流

```text
DSH 最终请求用量
  → compat/dsh 观察与持久化游标
  → Host 按请求路由折算 Pro 当量
      ├─ 在线：签名声明 → Backend / SQLite 事务记账
      └─ 离线：独立本地账本
  → 同源 HTTP + SSE → 今日梁案 / 香火环 / 梁祠
```

- 在线 Backend 决定扣香、幂等票据、唯一香客、聚合与快照；浏览器只发送意图。
- 社区仍为 `DEV_STAGING_ONLY` 软信任：安装密钥不等于实名身份，Token 是 Host 声明，不是可验证生产票权。
- 在线与离线分别保存身份投影、香火、投票、梁案和档案；共享已结算会话游标以避免同一用量重复凝香。
- 梁位、梁子与统计来自同版权威快照。网络失败保留在线偏好、锁票并自动重连，不静默切换模式。
- 不保存或传输提示词、回复、源码、会话正文或原始文件路径；Backend 不接收模型名。
- 自动上香的本机夯/拉统计由 Host 按模式持久化，页面与手动记录合并展示；Backend v11 的原始成交回执用于丢回执后的准确重放，不改变投票额度。
- 实时请求活动是独立的 Host → Client 布尔信号，只在开始/结束翻转推送；不读取块正文、不估算数字、不写账本或发送至社区。香火环显示轻量光效与“凝香中”，减少动态时静态呈现；结束、取消、失败及宿主连接断开后停止。

## 当前产品行为

| 功能 | 最终规则与资料 |
|---|---|
| 小难梁 | 有票且梁位 <25%；25%–<50% 为梁工。旧梁案和档案保留原规则，见 [`ISSUE2_IMPLEMENTATION.md`](ISSUE2_IMPLEMENTATION.md) |
| 凝香 | Pro ×1；Flash、其他及未知 ×0.5；按每个请求最终用量结算。V4.1 路由与重试/迁移边界见 [`INCENSE_POLICY.md`](INCENSE_POLICY.md)、[`PR7_REVIEW.md`](PR7_REVIEW.md) |
| 拍梁子 | 单击 200ms 判定开合；双击/连拍保持面板状态。主面板固定，独立三行短句下落渐隐，见 [`PR6_FEEDBACK_REDESIGN.md`](PR6_FEEDBACK_REDESIGN.md) |
| 定时上香 | 默认关闭，满 500 炷后每 10 分钟按限额上香，23:59 再收尾一次；复用原开关/方向，旧开关需重新开启，手动优先、意图持久化且不跨日补投，见 [`DAY_END_INCENSE.md`](DAY_END_INCENSE.md) |
| 连接 | Host 跟随后端 cadence；只过滤业务内容相同的 SSE 整帧，真实变化即时发送，见 [`CONNECTION_EFFICIENCY.md`](CONNECTION_EFFICIENCY.md) |
| 更新说明 | 仅展示当前版相对上次正式版的一份说明，不补播历史；最高已读版本防止旧版自动弹出，可从案牍主动重看。保留首次指导、QQ 二维码及鸣谢 |
| 走势 | 只读的本机观察烛线：Host 每秒采样、1 分钟成桶、按日落一个文件；掉线画虚线并写「未统计」，换案断开、不插值；案牍直接打开主题一致的独立弹窗或全屏，见 [`LIANGXIANG_BARS.md`](LIANGXIANG_BARS.md) |

投票额度默认每分钟恢复 500 炷，桶容量与单次请求仍各最多 500 炷；定时上香保持 10 分钟。
凝香速度核对结论与未核验边界见 [`INCENSE_AUDIT.md`](INCENSE_AUDIT.md)。
梁小号保留称号展示，不再响应点击、悬停或键盘聚焦弹出解释。

Desktop 通过原生“插件 → 添加插件”输入完整包名 `dsh-liangxiang` 安装；命令行 WebUI 独立管理 Profile。安装图解、升级和卸载见 [`INSTALL.md`](INSTALL.md)。
在线一直连不上时先排查 DSH Host 到社区的网络；部分地区可尝试代理，见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。

## 实现位置

- `src/domain/`：纯业务规则、倍率、梁位与档案聚合。
- `src/shared/`：Host、Client、Backend 的 wire 校验及版本。
- `src/compat/dsh/`：DSH 接口、请求用量、存储与升级适配的唯一接触层。
- `src/host/`：结算、持久化、模式、定时上香排期、同源路由与生命周期。
- `src/client/`：交互与展示，不持有余额或投票权威。
- `src/backend/`：HTTP、SQLite 事务、身份、票据、快照与梁祠。

存储使用既有 DSH storage domain。在线为 `liangxiang.json`，离线为 `liangxiang_local.json`；
走势是唯一例外，按业务日落 `storages/liangxiang-bars/days/<date>.json`（可重建的派生数据，坏文件只跳过）；
正常更新/卸载不删除账本。Backend 数据位于运维配置的 SQLite 文件，迁移和备份规则见 [`121-vps-deploy.md`](121-vps-deploy.md)。

## 验证与协作

完成变更至少运行 `pnpm run verify`；DSH/打包触点运行 `smoke:clean-profile`，UI 运行
`smoke:browser-clean-profile`，权威/API 变化运行 `smoke:online`，提交和推送必须通过隐私门禁。
完整候选验证、集成 CI 与提交证据集中记录在 [`RELEASE_READINESS_1_2.md`](RELEASE_READINESS_1_2.md)。

个人 fork 从最新社区 main 开发并向 main 提 PR；三平台锁定依赖、隐私与完整安装、
浏览器及隔离在线检查均通过后由维护者审核合入。CI 使用只读权限，不重复运行 push 检查。
旧 dev 冻结保留，确认全部历史进入 main 并取得单独批准后才删除；不再自动晋级。
协作与 DSH alpha 预警以 [`CI.md`](CI.md) 为准，代码合入不授权发布或部署。

每次上线均需独立执行 `scripts/deploy-check.sh` 核实真实运行版本；不能从源码或 CI 成功推断生产已更新。
