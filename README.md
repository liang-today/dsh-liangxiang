# dsh-liangxiang(梁相)

> **用 DSH 攒香火，一炷夯或拉，共同显出今日梁相。**

梁相是一个 DeepSeek Harness(DSH)WebUI 插件:

- 用 DSH 的 **Input + Output Token** 攒个人香火,默认 **50,000 Token = 1 炷**;
- 香火就是你的参与库存，**夯与拉共用同一个库存**，一炷香对应一次选择；
- 对当天唯一的二元梁案选择「夯 / 拉」；按钮为 **夯 · 升梁 / 拉 · 降梁**；
- **香火环** = 当前剩余香火（旺盛程度）+ 距下一炷的 Token 进度（环形填充）；`LiangQi` 仅保留为内部兼容名；
- 中央**梁子**只由**本社区节点的夯拉比例**决定:`待开梁`(零票)/ 梁工 / 梁总 / 梁神 / 梁圣 / 梁祖;
- 面板正中只有一个公开数字 **梁位**(= 社区夯率,6 位小数),每一票都看得见它在动;
- 底部 **三界香火** = 当前梁案已接受票数，**五行香客** = 至少成功投过一票的独立安装身份数。
- 底部 **梁相案牍** 收纳主页、异常核香、手动在线/离线模式切换与版本信息；日常同步、重连与档案更新均自动完成。
- 底部 **进入梁祠** 打开插件内月历：今日进行中、永久日梁、周梁、月梁，以及只统计到昨天的本周/本月暂梁。

悬停文案恒为 `今日梁相`;入口图标就是当前梁子那一态,可以拖到画面任意位置。

每日结案后，今日结果收入梁祠成为日梁，并继续汇成周梁与月梁。三界香火、五行香客、梁相案牍与梁祠共同沿用“现代编年志 × 克制梁祠”的仪式化语言。

> 梁相是独立社区项目，非 DeepSeek 官方产品。梁位是社区软信任玩法，不代表实名人数、真实民意或任何个人、机构立场。

产品语义冻结于 [`AGENTS.md`](AGENTS.md) 与 [`docs/PRODUCT_FREEZE_V0.1.md`](docs/PRODUCT_FREEZE_V0.1.md);历史勘察文档中的旧模型(梁签、cache-read 10% 权重等)已废弃,见 [`docs/SEMANTIC_CORRECTION_R2.md`](docs/SEMANTIC_CORRECTION_R2.md)。

当前状态:**在线全链路(localhost)+ 两种诚实标注的 authority 模式**。

| 模式 | 触发 | 权威 | 适用 |
|---|---|---|---|
| `LOCAL_FAKE_DEV` | 首次欢迎页或梁相案牍明确选「离线模式」；也可用 `LIANGXIANG_BACKEND_URL=local` 设首次默认 | Host 进程内 + 独立 `liangxiang_local.json` | 可长期自玩的单机模式 |
| `DEV_STAGING_ONLY` | 默认；首次欢迎页或梁相案牍明确选「在线模式」 | 独立 Liangxiang 后端 + SQLite(`/v1/*`) | 社区软信任 |

模式选择会保存在 Host；断网只会锁住在线夯/拉并自动重连，绝不会自动切到离线。两边的香火、打梁和梁祠互不合并；切回在线必须先成功连接社区。

在线链路:DSH Host 观测真实 provider-reported 用量(`tokenUsage` 投影,水位差分防重)→ 作为**声明**上报 `POST /v1/token-claims` → 后端在 DB 事务里原子扣香、幂等去重、更新聚合 → 按 cadence 发布 `public_liang_snapshot` → Host 经 `/liangxiang/api`(state/SSE/vote)推给浏览器。梁祠另走低频 `/v1/history` → `/liangxiang/api/history` 冷通道：首次全量、归档版本变化后仅取增量，秒级 SSE 不重复携带历史数组。

**诚实声明(必读)**:Decision Gate A 判定为 **A3**([`docs/043`](docs/043-decision-gate-a.md))——DSH 不提供服务器可验证的身份与 Token 权威。因此:

- 后端**能**保证:同一安装不超支、同一 `request_id` 不重复扣香、多标签收敛、业务日与快照版本一致;
- 后端**不能**保证:投票者是谁(`installation_id` 是自铸可重置的**假名安装标识**)、Token 用量是否真实(`claimed_effective_tokens` 是**不可验证的声明**);
- 因此这**不是** secure / verified / 可信全网 usage voting。`VERIFIED_PRODUCTION` 在后端启动门禁与 wire 类型上双重禁用,UI 屏幕阅读器摘要固定播报社区软信任说明（安装密钥 + 本机声明 Token，不是公投）。详见 [`docs/075`](docs/075-backend-decision.md)、[`docs/121`](docs/121-vps-deploy.md)。

当前社区后端使用“公开短期入梁券 + Ed25519 安装签名”的公网 soft-trust
准入：新客户端自动取券并认领一次，之后只凭安装私钥长期连接；旧共享口令
通道已经从代码与部署配置中删除，入梁券是首次登记的唯一准入。数据与服务位于香港，正式客户端统一连接
`https://api.liang.today`。npm 已提供历史占位包 `dsh-liangxiang@0.8.0`；本仓当前
候选是尚未发布的 `0.8.2-beta`。正式更新 beta 标签前仍应显式使用 `@beta` 安装；
npm registry 为首个版本同时建立了 `latest` 指向。尚未发布
GitHub Release。迁移实录见
[`docs/142-hk-migration-report.md`](docs/142-hk-migration-report.md)。

## 文档导航

| 想知道 | 看 |
|---|---|
| 怎么装、怎么跑 | [`docs/INSTALL.md`](docs/INSTALL.md) |
| 出问题了 | [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) |
| 数据从哪来、谁说了算 | [`docs/DATA_FLOW.md`](docs/DATA_FLOW.md) |
| 采集了什么、什么绝不出网 | [`docs/PRIVACY.md`](docs/PRIVACY.md) |
| 安全控制清单 / 威胁模型 | [`docs/SECURITY.md`](docs/SECURITY.md)、[`docs/101-threat-model.md`](docs/101-threat-model.md) |
| 信任模型为什么是软信任 | [`docs/075-backend-decision.md`](docs/075-backend-decision.md) |
| 已知限制 | [`docs/102-known-limitations.md`](docs/102-known-limitations.md) |
| 待修问题 / 随时提醒 | [`docs/BUGFIX.md`](docs/BUGFIX.md) |
| 测试覆盖 | [`docs/103-test-matrix.md`](docs/103-test-matrix.md) |
| DSH 版本基线与升级清单 | [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) |
| 客户端断连恢复与一键更新 | [`docs/144-client-recovery-and-update.md`](docs/144-client-recovery-and-update.md) |
| 服务器统一命令与梁案排期 | [`docs/143-case-bank-and-operations.md`](docs/143-case-bank-and-operations.md) |
| RC 结论 | [`docs/100-release-readiness.md`](docs/100-release-readiness.md) |
| 原始禁令 vs 当前实现 | [`docs/110-prohibition-refresh.md`](docs/110-prohibition-refresh.md) |
| Demo → 社区产品 | [`docs/120-community-product.md`](docs/120-community-product.md) |
| 梁祠产品/实现契约 | [`docs/130-liangci-design.md`](docs/130-liangci-design.md) |
| 梁相品牌、主题与宣传口径 | [`docs/140-liangxiang-brand.md`](docs/140-liangxiang-brand.md) |

其余设计文档:`000` 版本基线、`001` DSH 勘察问答、`002` 架构、`003` 兼容性矩阵、`020` UI、`030–032` 领域模型/不变量/P0 矩阵、`040–044` authority 勘察、`050–062` 本地闭环、`070–076` 在线后端。

## 结构

```
├── package.json          # dsh.bundle + dsh.client 双清单
├── cordis.patch.yml      # bundle 层:插入 Host 插件行
├── tsdown.config.ts      # Host ESM + Client 浏览器 CJS factory(复刻树内包装格式)
└── src/
    ├── index.ts          # Host entry(package main)
    ├── host/             # Host 插件本体
    ├── client/           # Client entry + 占位徽章
    ├── shared/           # host↔client wire + host↔backend /v1 契约
    ├── domain/           # 纯逻辑层(折算/阈值/快照/投票词汇)
    ├── backend/          # 独立后端进程(node:http + node:sqlite),不进 DSH bundle
    └── compat/dsh/       # 唯一允许直接 import DSH API 的层
```

## 开发(Development)

前置:Node ≥ 22(DSH 官方要求 ^22.19.0 || >=24)、pnpm ≥ 10、可访问 npm registry。骨架本身**不需要任何 API key**。

所有 `dsh` 调用通过 devDependency `@deepseek-ai/dsh` 进行(`pnpm exec dsh`),并默认使用项目本地 `DSH_HOME=<repo>/.dsh-home`(gitignored),不触碰你的 `~/.dsh`。可在 `.env` 覆盖(见 `.env.example`)。

### 命令一览

| 目的 | 命令 |
|---|---|
| 安装依赖 | `pnpm install` |
| 严格 typecheck | `pnpm run typecheck` |
| Lint | `pnpm run lint` |
| 单元测试 | `pnpm run test` |
| 构建 Host + Client 产物 | `pnpm run build`(产出 `lib/index.js`、`lib/client.js`) |
| 一键验证 | `pnpm run verify` |
| 安装进 `liangxiang-dev` profile | `pnpm run dev:install` |
| 查看 effective config | `pnpm run dev:dump-config` |
| 启动 WebUI(带插件) | `pnpm run dev:web`(默认 `http://127.0.0.1:3080`) |
| 卸载插件 | `pnpm run dev:uninstall` |
| 打本地 tarball | `pnpm run pack:tarball` |
| 干净 profile 冒烟测试 | `pnpm run smoke:clean-profile` |
| 启动后端(在线模式) | `pnpm run backend:start`(默认 `http://127.0.0.1:4180`) |
| 构建 + 启动后端 | `pnpm run backend:dev` |
| 在线全链路冒烟 | `pnpm run smoke:online` |

### 在线模式(DEV_STAGING_ONLY)本地跑法

```bash
pnpm run build
LIANGXIANG_BACKEND_DB=.liangxiang-backend/dev.sqlite pnpm run backend:start
# 另一个终端:
LIANGXIANG_BACKEND_URL=http://127.0.0.1:4180 pnpm run dev:web
```

`pnpm run smoke:online` 会自动完成上面两步并断言:后端拒绝 `VERIFIED_PRODUCTION`、Host 报告 `DEV_STAGING_ONLY`、claim 折算、同 `request_id` 只扣一次香、50 并发只接受 1 票、快照按 cadence 发布。

### 开发循环

1. `pnpm install` — 安装工具链与 DSH 类型包/CLI(`prepare` 会顺带构建一次)。
2. `pnpm run dev:install` — 构建后创建 `liangxiang-dev` profile:先装 `@deepseek-ai/dsh-web-app`(Web 界面层),再以 **pnpm link 方式**装入本地检出;随后自动用 `--dump-config` 断言 `dsh-liangxiang` bundle 层存在。
3. `pnpm run dev:web` — 启动 WebUI。右缘应出现占位圆点,悬停显示 `今日梁相`;终端出现 `[dsh-liangxiang] host half active`。
4. 改 Client 代码后 `pnpm run build`(或 `pnpm exec tsdown --watch`):web-app 组合默认挂载的 HMR 会 stat-poll 到 `lib/client.js` 变化并热替换,无需重启;改 Host 代码需重启 `dev:web`。
5. `pnpm run dev:uninstall` — 移除依赖与 bundle 层,并断言 dump-config 中不再出现;重启后徽章与 Host effect 一并消失(注册寿命随插件 fiber)。

### Profile 模块图纪律（踩过的坑）

`dsh plugin add` 既写 `dsh.profile.bundles`，也把包 pnpm-install 进 `<profile>/node_modules`。对 **in-box bundle**（`@deepseek-ai/dsh-web-app`）只需要前者：装进来的那份连同它的闭包（`dsh-tools`、`dsh-session`、`dsh-storage-domain`…）会遮蔽 launcher 维护的 `<DSH_HOME>/profiles/node_modules`，于是同一个包在一个进程里存在**两个模块实例**。DSH 用 `unique symbol` 连接内部接缝（`dsh-tools` 的 `TOOL_RUNTIME_SCHEDULER`，由 `dsh-agent-loop` 读取），两个实例就是两个 symbol：

- 每次工具调用都报 `Cannot read properties of undefined (reading 'prepare')`；
- 由于 assistant 的 `tool_calls` 已写进会话，之后同一会话还会连带报 `An assistant message with 'tool_calls' must be followed by tool messages`。

所以 `dev:install` / `smoke:clean-profile` 在加完 bundle 行后会把该依赖再移除，并用 `node scripts/assert-profile-modules.mjs <profile-dir>` 断言「每个 in-box 包只有一个实例」。手工装过插件后可以随时单独跑这条断言。

### 发行验证

`pnpm run smoke:clean-profile` 会:打 tarball → 在全新 profile 安装 web-app + tarball → 断言 dump-config 有 bundle 层 → 启动 WebUI → 断言 `/plugins/dsh-liangxiang/client.js` 以 `window.__ModuleLoader__.load` banner 开头、`__DSH_BOOT__` 启动图包含本插件、Host 生命周期日志出现 → 清理。

### 版本基线注意

DSH 处于预发布(首个 tagged release 前无兼容承诺)。本骨架的类型/CLI devDeps 钉在 npm `0.1.0-rc.6`,源码勘察基线是本地检出 `47f94385`(`0.1.0-rc.5`,rc.6 的直接前驱);升级任一侧前先按 `docs/000` 的重勘察清单核对,重点是 `docs/003` C6 行(浏览器 bundle 包装格式,树内 preset 不发布,本包在 `tsdown.config.ts` 复刻)。
