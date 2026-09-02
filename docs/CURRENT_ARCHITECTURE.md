# 梁相：当前架构与事实索引

> Agent 默认入口，最后核对：2026-09-03。先完整阅读根目录
> [`AGENTS.md`](../AGENTS.md)，再读本文与 [`docs/README.md`](README.md)。
> 本文记录“现在是什么”；产品契约冲突时永远以 `AGENTS.md` 为准，精确 DSH
> 兼容基线以 [`COMPATIBILITY.md`](COMPATIBILITY.md) 为准。

## 1. 事实优先级

1. `AGENTS.md`：唯一产品与工程法则。
2. 本文：当前代码、仓库边界、运行架构与限时运维快照。
3. `140-liangxiang-brand.md`、`COMPATIBILITY.md`、安装/安全/隐私文档：各自领域的现行说明。
4. 源码与测试：实现证据；若违反上层契约，说明实现需要修复，不是契约自动失效。
5. `docs/README.md` 标为“历史”或“归档”的文件：只能追溯决策，不能指导新实现。

不要把超长 Cursor Prompt、旧 Phase、旧发布报告或宣传产物一次性装入 Agent
上下文。只读取当前任务需要的现行参考。

## 2. 仓库边界

| 路径 | 角色 | 写入边界 |
|---|---|---|
| `dsh-liangxiang/` | 插件、Host、Client、社区 Backend 主仓 | 当前开发仓；按 `AGENTS.md` 验证、提交、推送 |
| `../liang-xiang-page/` | `liang.today` 官网与 Pages 构建 | 独立 Git 仓，独立验证和提交 |
| `../deepseek-harness/` | 当前钉住的 DSH 源码证据 | **只读**，不得为梁相打补丁 |
| `../promo-video/` | Remotion 宣传视频工程 | 非 Git；改动前先明确版本与交付方式 |
| `../Promo-Output/` | 历史安装包、截图和宣传输出 | 归档，不是产品或文案事实源 |

技术命名只使用 `dsh-liangxiang`、`liangxiang`、`/liangxiang/api`、
`LIANGXIANG_*` 和 `liangxiang-backend`。产品语义、四区 UI、二元投票、梁位、
梁子状态与香火环规则不在本文重复定义，直接服从 `AGENTS.md`。

## 3. 当前运行架构

```text
DSH provider-reported tokenUsage
        ↓
src/compat/dsh（唯一 DSH 接触层）
        ↓
Host 用量差分、模型权重、跨会话高水位
        ├── online → 签名 Host 声明 Token → 社区 Backend / SQLite
        └── offline → 独立本地账本
        ↓
/liangxiang/api/*（同源 HTTP + SSE；浏览器从不当权威）
        ↓
Badge / 今日梁案 / 香火环 / 二元投票 / 梁祠
```

重要短广播复用 Backend 的约 1 秒 snapshot → Host SSE 通道，只在空闲反馈行暂代
「梁小号」并按时间失效；不新增浏览器直连、运营 HTTP 口或独立轮询。

- `src/domain/`：纯规则；Token、香火、梁位、梁子、档案聚合。
- `src/shared/`：Host、Client、Backend 的 wire/API 校验。
- `src/host/`：DSH 用量观测、持久化、模式切换、同源路由与生命周期。
- `src/client/`：展示与意图；不持有投票或余额权威。
- `src/backend/`：`node:http + node:sqlite` 社区服务、事务、身份、快照、梁祠。

### 权威与存储

- 在线身份的 Ed25519 密钥只证明同一安装仍持有私钥；Token 是 Host 自报，当前是
  `DEV_STAGING_ONLY` 社区软信任，绝不能宣传为可验证生产票权。
- 在线 Backend 的 SQLite 事务权威决定扣香、接受票、幂等、唯一香客、聚合和快照。
- 在线核心状态在 `storages/liangxiang.json`；离线玩法在懒创建的
  `storages/liangxiang_local.json`。两种模式不合并香火、票、梁案或档案。
- 两种模式只共享会话高水位，防止同一段 DSH 累计用量在两侧重复凝香。
- Global ratio、Liangzi state 与计数必须来自同一 snapshot；梁祠走独立 history 冷通道。
- 网络中断保持 online 偏好、锁票并自动重连，绝不静默切换 offline。
- 不记录或传输 prompt、回复、源码、会话内容、凭据或原始文件路径。

## 4. 版本矩阵

以下是 `1.1.6` 正式发布基线：

| 组件 | 当前事实 |
|---|---|
| 插件程序号 | 当前源码 `package.json` / `PLUGIN_VERSION` = `1.1.6`；npm `latest` = `1.1.6` |
| 本地 Backend 源码 | `SERVER_BUILD=1.1.6-u1`；schema v10（v9 receipt + v10 单行限时广播） |
| count 修复基线 | accepted 与 rejected 的 `count` 业务处置都保存 durable receipt；v7/v8→v9 migration 整体原子化 |
| DSH 兼容基线 | 源码审计为 `dsh-v0.1.2-alpha.5` / `db6bdc3576`；npm 无标签安装实际解析到的稳定线 `0.1.1-rc.2` 也已用同一份 1.1.6 tarball 完成真实 Profile 与浏览器回归；Node `22.23.1` / pnpm `11.7.0` |
| 官网 | `1.1.6` 官网源码已经验收，随本次正式发布推送独立仓 `main`；GoatCounter 使用一方统计域名，构建门禁会阻止漏装统计脚本 |
| 社区服务器 | `SERVER_BUILD=1.1.6-u1` / schema v10；只通过 `scripts/deploy.sh` 更新并由 `scripts/deploy-check.sh` 核验 |

服务器必须与部署分支当前 HEAD 一致。任何 Agent 都不得因为本地修复已提交，就声称
远端已升级；每次获准部署前后必须分别运行 `scripts/deploy-check.sh`。

## 5. 社区服务器脱敏快照

核对时间：2026-09-03；这是限时运维事实，不是永久常量。

- 香港 Rocky Linux 9.8 节点；`systemd` 运行 `liangxiang-backend`，Caddy 提供 HTTPS。
- Backend 仅监听 `127.0.0.1:4180`；部署目录 `/opt/liangxiang`，暂存目录
  `/var/tmp/liangxiang-deploy`，配置 `/etc/liangxiang.env`。
- SQLite 位于独立数据盘 `/var/lib/liangxiang/data/liangxiang.sqlite`，WAL，
  `quick_check=ok`、无外键异常；当前 schema v10。标准部署会在迁移前生成在线备份。
- 初次审计时数据库有 16 个梁案（1 active）、90 个安装身份、54 个实际投票安装、
  43,304 炷累计接受香火、12,293 条投票请求记录；批量请求与聚合账可对齐。
- 首轮 Profile 冒烟在隔离逻辑收紧前短暂触发在线 bootstrap，新增 1 个零投票测试身份、
  1 条当日状态和 1 条见面礼记录；未改变全局梁位、已接受香火或香客。未获删除授权，
  故保留并记账（复核时身份总数 91）。clean-profile 现已在 Host 启动前默认锁定 `local`。
- 梁祠 archive version 16：16 个日档、2 个周档、1 个月档。
- 本地部署备份存在且最近一份可读，但没有应用级定时 SQLite 备份；云备份需在云侧
  单独验收。journald 当前只在 `/run`，重启会丢失历史日志。

不在仓库写入服务器地址、SSH 用户、票券、密钥、公钥、签名或完整环境变量。

## 6. 当前风险与下一步门禁

### 发布前阻塞

- 远端 v7 尚无 `requested_count`、request receipt 或广播表；本地 schema v10 修复未部署。
  v7 accepted 行会回填为 count 未知的 accepted receipt：旧单票可按 count=1 安全重放，
  旧批量因无法恢复原始 count 而返回 409；历史 rejected 从未落库，无法追溯重建。v9
  对每个进入 service 的 accepted / stale / closed / insufficient 处置保存完整规范化
  payload；同 payload 重放既有处置，不同 case/type/count 必须冲突。HTTP 解析/鉴权失败、
  admission 429、网络和 500 不进入业务事务，也不占 request ID。部署前须再次验证
  v7→v10 migration、备份、重启和真实请求回归。
- 为防不同 ID 的 rejected receipt 无界写盘，新 accepted 按实际扣香数消耗限流 work
  units，新 service rejection 消耗 1；已存 receipt 的 replay/conflict 绕过 live bucket。
- 正常日切、关案和重启保留 receipt。只有带 `--yes` 的 `cases reset` / `archive clear`
  会和对应票据一起删除 receipt、明确释放这些 request ID；这是运维破坏性例外，不能
  当成日常幂等保留策略。
- DSH 是 Developer Preview。每次升级必须重新读钉住源码，不得凭模型记忆猜 API。
- DSH 的官方 token projection 允许同一 attempt 的最终样本向下修正；当前跨会话
  高水位适合累计样本，却可能保留过高的中间样本。完成 attempt 级结算适配前，必须把
  这项兼容性风险保留在 `COMPATIBILITY.md`，不能宣称 Token 投影已完全精确。
- 社区模式仍是 A3 软信任；没有可验证身份/Token 时不得升级安全宣传口径。

### 运维与质量风险

- 远端本地备份依赖部署/配置变更触发，缺少独立周期备份与保留策略。
- 远端日志易失；云备份、监控、证书和入口 ACL 需要运营侧持续验收。
- 2026-08-16/17 有 3,810 炷旧日账残留，但对应梁案/统计/档案已不存在；不影响
  当前业务日，清理前必须先定义保留政策，禁止直接删库。
- 六态图已改为可见像素等价的 lossless WebP，客户端从 977,821 B / gzip 612,398 B
  降至 648,163 B / gzip 363,554 B，并设 700 KB / gzip 400 KB 构建预算。剩余性能工作
  应以浏览器 profiler 为证据，重点观察拖动监听重绑和根组件动画重渲染；不得为追求
  指标破坏冻结 UI 契约。

## 7. 验证、提交与发布边界

主仓完成变更前至少运行：

```text
pnpm run verify
pnpm run smoke:clean-profile   # DSH/打包/安装触点变化时
pnpm run smoke:browser-clean-profile  # 真实临时 Profile + 浏览器/Axe/视觉基线
pnpm run smoke:online          # Backend/API/权威流变化时
```

当前浏览器基线为桌面、窄屏、暗色三组共 36 项，覆盖四区结构、恰好两个投票动作、
键盘与焦点环/返回、梁祠弹窗、axe WCAG A/AA 自动规则、视口几何和 reduced motion。若新发布的 DSH
包仍处于 pnpm 24 小时门禁内，只可在人工核对精确版本后为临时 smoke 设置
`LIANGXIANG_ALLOW_FRESH_DSH=1`，并直接运行 `bash scripts/smoke-clean-profile.sh`；
默认路径不得绕过供应链等待期。clean-profile 默认在 Host 启动前锁定 `local`，只有
显式传入 `LIANGXIANG_SMOKE_BACKEND_URL` 才允许它接触社区后端；脚本会先拒绝不满足
Node `^22.19 || >=24` / pnpm `11.7.0` 的运行环境。

- DSH 触点变化：记录准确源码路径/符号和 commit，更新 `COMPATIBILITY.md`。
- 官网变化：进入独立官网仓运行其构建和链接检查，独立 commit/push。
- 宣传视频变化：至少类型检查与渲染抽查；该目录非 Git，不能假装已有提交保护。
- 用户可见插件改动：同步提升 `package.json` 与 `PLUGIN_VERSION`，两者必须相同。
- 仅 Backend 改动：只递增 `SERVER_BUILD` 的 `-uN`，不浮动客户端程序号。
- 完成的仓库改动按 `AGENTS.md` commit + push；不得覆盖其他 Agent/用户的工作树。
- 未经用户明确命令，禁止 npm publish、GitHub Release、公开/生产部署、修改真实 DSH
  profile 或修改 `../deepseek-harness`。
- 社区部署只能走 `scripts/deploy.sh`；不得手工 rsync、构建、迁移或重启来绕过备份、
  health/history smoke、Caddy 校验与 `VERSION` 门禁。
