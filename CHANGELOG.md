# Changelog

## 0.1.0 — 未发布

### 社区软信任上公网（Ed25519 + 香火 drip + VPS）

- **安装身份**：每次安装生成 Ed25519 密钥对（私钥留 Host，公钥进 `community_identity`）。请求签名；可选 MAC 集合哈希绑定，挡住同一台机器轻易重装。这不是 DSH 认证，也不是反女巫。
- **香火 drip**：默认每分钟最多接受 50,000 声明 Token（= 1 炷）。防瞬间自报天文数字；不能证明 DSH 真跑过。时间用服务器时钟，启动时向硬编码 NTP 告警偏移。
- **公网鉴权**：默认拒绝未签名请求；可选 `LIANGBIAO_COMMUNITY_KEY`。VPS 配方见 [`docs/121-vps-deploy.md`](docs/121-vps-deploy.md)（systemd + Caddy）。仍禁止声称 verified。
- **文案**：`STAGING_MODE_NOTE` 改为社区软信任说明，不再说「本地预发」。

### 社区产品方案（未开工）

- 选定 [`042`](docs/042-auth-trust-model.md) 路径 ③：不等 DSH 可验证身份，把 RC Demo 做成社区软信任产品。方案见 [`docs/120-community-product.md`](docs/120-community-product.md)。下一步是 C1（能发给朋友），需明确授权非 localhost 后端与 GitHub Release。

### 两翼计数缩写

- **两翼计数**：`formatCompactCount`——`0–999` 原样，`1,000+` 四舍五入为 `K`/`M`/`B`（`3,000`→`3K`，`46,935`→`47K`，`1,234 炷`→`1.2K`）。这是防呆：默认 50K Token/炷时香火涨得慢，但两翼只有 64px。精确值仍在 tooltip 与屏幕阅读器里。梁位继续截断、不四舍五入。

### 居中修复 + 投票文案还原 + git push 站立指令

- **梁子必须正中**：Region 2 不再用 flex `space-between`。环、头像、环上香火点是唯一占文档流宽度的列，水平居中；「我的香火 / 下一炷」绝对定位 overlay，文案长短不能把梁子挤偏。
- **投票按钮**：`夯：升梁！` / `拉：降梁！`，`1fr / 1fr` 等宽标齐。投票类型仍只有 `up`/`down`。
- **Git**：`AGENTS.md` §15 覆盖 Prompt 4/11「禁止 git push」——每次改完提交并立即 push。仍禁止 npm publish / GitHub Release / 公网部署 / 改真实 DSH profile。
- 禁令差异表：`docs/110-prohibition-refresh.md`。**已按「全部刷新」回写** `PRODUCT_FREEZE_V0.1.md` 与 `LIANGBIAO_CURSOR_MASTER_R3.md`。

### v0.1 Release Candidate（本地加固与终审）

- **布局稳定性**：两翼与统计项改为固定宽度 + `tabular-nums`，数值变化（`5 炷`→`12 炷`、`3,000`→`46,935`）不再把中央梁子挤偏;梁位药丸固定宽度。
- **梁位**：小数从 4 位增到 **6 位**（大盘下 4 位会「冻住」）；被接受的投票**在自己的事务里发布快照**并随响应带回，梁位在点击那一下就动（不再等 cadence、不多一次往返）；数值变化时播放一次短促 pop 动效，`prefers-reduced-motion` 下不播。
- **加固修复**：干净 profile 冒烟脚本在产物变大后必然失败（`curl | head -c` 写错误 + `pipefail`）—— 发布验证路径本身是坏的，已修；后端限流表按可自造的 installation id 无界增长，已改为超阈值清扫并加洪泛回归测试；`assertValidCase` 参数改名以免污染语义扫描。
- **发布文档集**：新增 `RELEASE_CHECKLIST.md`、`CONTRIBUTING.md`、`SECURITY.md`、`docs/{100-release-readiness,101-threat-model,102-known-limitations,103-test-matrix,SECURITY,PRIVACY,DATA_FLOW,INSTALL,TROUBLESHOOTING,COMPATIBILITY}.md`;README 换成冻结的核心描述与文档导航。
- **RC**：`dsh-liangbiao-0.1.0.tgz`（sha256 `3123a117…9bdc3`），257 项测试全绿、两个冒烟全通、`pnpm audit --prod` 无漏洞、包内容仅 6 个预期文件。结论：本地/staging **Go**，公网与「可信」表述 **No-Go**（由后端启动门禁强制）。

### 交互改版：近实时梁位 + 单值小数 + 自由放置徽章

- **近实时**：快照 cadence 默认 300s → **1s**（backend 与 host 下限同步到 1s），投票被接受后 Host 立即再拉一次快照，投票者约 1 秒内看到梁位变化；`public_liang_snapshot` 加入 200 条保留上限（同事务裁剪）。个人余额新增每 5 tick 的 `/v1/me/daily-state` 回读，带外改动（另一标签/另一 Host）也会收敛。
- **单值梁位**：Region 2 改为「左=剩余香火 `N 炷`｜中=梁子+梁气环｜右=距下一炷 `X Token`」，梁子下方只留一个全局数字 `梁位 83.021952%`（6 位小数，仍是截断不四舍五入，所以不会越阈值）。`拉` 不再占第二个大数字，只在 tooltip 与屏幕阅读器摘要里出现。理由：两个互补整数百分比让「投一票 90% 还是 90%」，单值+小数每票都动。
- **自由放置徽章**：入口图标改为**当前梁子五态头像**（不再是「梁」字），可指针拖拽到画面任意位置，坐标夹回可视区并存 `localStorage`（纯外观偏好）；拖拽超过 4px 时吞掉随后的一次 click，所以拖完不会误开合面板；面板按剩余空间自动翻转左右、贴边时改垂直锚点。
- AGENTS.md 的 Region 2 / §4 / §12 与 docs/020、032、070 已按上述新契约更新;新增/改写 20 项测试（布局、单值小数、放置数学、近实时、保留上限、余额收敛），总计 251 项全绿。

### 测试环境修复 + 安全审计

- **修复 dev profile 的工具调用崩溃**：`dsh plugin add @deepseek-ai/dsh-web-app` 把 in-box 闭包装进 `<profile>/node_modules`，遮蔽了 launcher 的 `profiles/node_modules`，导致 `@deepseek-ai/dsh-tools` 在一个进程里有两个模块实例——两个 `TOOL_RUNTIME_SCHEDULER` symbol，于是 `dsh-agent-loop` 每次工具调用都拿到 `undefined`（`Cannot read properties of undefined (reading 'prepare')`），并把会话留下无结果的 `tool_calls`（后续报 "must be followed by tool messages"）。`dev-install.sh` / `smoke-clean-profile.sh` 现在只保留 bundle 行、移除该依赖，并用新增的 `scripts/assert-profile-modules.mjs` 断言单实例。
- **超限请求体改为 413**：`/v1/*` 与 `/liangbiao/api/vote` 不再 destroy socket（被掐断的连接与网络故障不可区分，会诱发错误重试），改为结构化 413 + `connection: close`。
- 60 项即席并发/安全审计全过：200 并发抢 1 炷只成功 1 次、200 并发抢 50 炷恰好 50 次、50 并发同 request_id 只扣 1 炷、claim 与扣香并发下 `used<=earned`、并发读快照全部自洽；身份头（缺失/超长/穿越/注入/unicode）全部 401、投票体自报权威字段全部 400、SQL 注入按字面量处理且五张表完好、异日与更小 claim 被忽略、被拒的 request_id 不被污染。

### Backend + Online Integration（Phase 3，localhost / DEV_STAGING_ONLY）

- **Authority 模式锁定**：Decision Gate A3 ⇒ `AUTHORITY_MODE=DEV_STAGING_ONLY`。后端对 `VERIFIED_PRODUCTION` 拒绝启动，wire 的 `AuthorityMode` 联合类型不含该值，个人状态恒带 `claim_source: host_observed_unverified` + `claim_verified: false`（见 `docs/075`）。
- **后端**（`src/backend`，零新增依赖：`node:http` + `node:sqlite`）：schema v1（`daily_liang_case` / `daily_incense_state` / `liang_vote` / `daily_liang_stats` / `public_liang_snapshot`，一个业务日一个 active 案由 partial unique index 保证，`used*tpi <= claimed` 由 CHECK 兜底）；`/v1/bootstrap`、`/v1/token-claims`、`/v1/votes`、`/v1/snapshot`、`/v1/me/daily-state`、`/v1/health`；投票事务 `BEGIN IMMEDIATE` + 条件 UPDATE（CAS 扣香）+ `UNIQUE(installation_id, request_id)` 幂等 + 首票香客 +1；快照按 cadence append-only 发布，比例与梁子状态由同一行派生。
- **Host 在线化**：`LiangHostService` 接口让 `/liangbiao/api/*` 同时服务两种模式（浏览器 wire 形状不变，UI 零改动）；`BackendLiangService` 上报 token claim（debounce + 单调 ratchet）、拉取快照、日切自动重新 bootstrap；`UsageProjection` 抽出本地观测；自铸假名 installation id 持久化于 storage domain `identity` 表（不复用 DSH 匿名 id）。
- **诚实标注**：新增 `STAGING_MODE_NOTE`，面板 `data-liangbiao-authority` 与屏幕阅读器摘要按模式播报真实信任边界。
- 新增 56 项测试（后端事务/HTTP 并发/幂等/多标签/日切/快照版本、Host↔Backend E2E），总计 236 项全绿；新增 `scripts/smoke-online.sh` 全链路冒烟（50 并发只接受 1 票）。
- 文档：`070` 架构、`071` schema、`072` 事务与并发、`073` 业务日、`074` authority 数据流、`075` 决策与生产阻塞项、`076` `/v1` API。

### UI 修正（Phase 3 前）

- 比例显示与阈值对齐：`formatRatioPercents(upVotes, downVotes)` 与梁子状态同源于快照原始计数，夯率截断到整数百分点（拉率取补数），修掉 89.6% 被四舍五入成 `90%` 却仍显示梁圣的观感错误;梁圣区间明确为 `80% ≤ 夯率 < 90%`。
- 状态区间可见化：`liangziUpRatioBand` + `liangziRatioRangeText` 从阈值策略推导文案，梁子标签 `title` 与 svg `aria-label` 直接给出精确区间。
- 社会化区放大（15px 文案 / 17px 加粗数值），图标改为 `🪔 香火` / `🙏 香客`（常量集中于 `shared/index.ts`）。
- 梁案标题与内容居中，关闭按钮绝对定位;移除可见「本地演示」徽标，软信任标注改由 `data-liangbiao-authority` 与屏幕阅读器摘要承载。
- 新增 10 项测试（区间、截断、补数、居中、图标、tooltip），总计 180 项全绿。

### DSH Authority Spike + 真实 Token + 本地完整闭环（Prompt 2）

- Authority Spike（docs/040–044）：DSH 无 authenticated user、无服务器可验证 Token 权威;anonymous-user-id 仅假名标识。**Decision Gate A = A3**，生产可信投票标记 BLOCKED（P0 open risk），本地闭环以 `LOCAL_FAKE_DEV` 模式诚实标注。
- 真实 Token 接入：`tokenUsage` 投影观测（启动补扫 + 变更流），每会话高水位差分账本（replay/restart/重放/替换回落均不双计;新会话 `firstLiveSeq===0` 全额计入，resume/fork 基线化），按可配置 business timezone 入账当日，storage domain `liangbiao` v1 持久化（缺席时内存降级）。
- 本地投票闭环：`FakeAuthoritativeLiangService`（同步事务防并发双花、requestId 幂等、首票香客、快照 cadence 发布——比例与梁子状态同 sequence）、`/liangbiao/api` HTTP+SSE 通道（边界校验、body 上限、心跳、卸载清理）、client live store（帧校验、旧帧拒收、同 id 有界重试、离线保留最近状态）。
- 新增 45 项测试（水位账本、服务事务矩阵、wire 边界、live store），总计 170 项全绿。

### R2 语义对齐 + 正确 UI + 领域模型（Prompt 1）

- 业务语义纠偏至 R2 冻结模型：全网夯率驱动中央梁子（待开梁 + 梁工/梁总/梁神/梁圣/梁祖），个人梁气 = 剩余香火 + 下一炷 Token 进度;废弃 梁签/cacheRead×0.1/目标模型口径/per-request cap（见 `docs/SEMANTIC_CORRECTION_R2.md`）。
- 纯领域层 `src/domain`：Token→香火折算（50K=1 炷，可配置）、梁子五态阈值策略（60/70/80/90）、快照一致性（比例+状态同 sequence）、二元投票词汇与幂等 requestId、fail-safe 校验。
- 正确 UI（mock 数据）：面板四区（今日梁案 / 夯比例·梁子·梁气环·拉比例 / 夯拉双按钮 / 香火·香客），具象 LiangAvatar 六态原创 SVG，LiangQiRing 整合 `N 炷 · 再 X Token`，键盘/Escape/焦点管理/reduced-motion/明暗主题。
- P0 测试矩阵 125 项（Token 边界、库存、重复/混投、阈值、全局/个人解耦、阈值穿越、零票、非法输入、UI 结构）。

骨架里程碑(不含正式功能):

- 可安装的 DSH out-of-tree bundle:`dsh.bundle`(cordis.patch.yml 插入 Host 行)+ `dsh.client`(platform web)。
- Host 半:仅一个生命周期标记 effect(激活/卸载日志),无用量观测、无存储、无路由。
- Client 半:向 `shell.overlay` 注册一个占位圆点(悬停/聚焦文案 `今日梁位`),无正式 UI。
- 分层:`shared` / `domain`(占位) / `host` / `client` / `compat/dsh`(唯一直接触碰 DSH API 的层)。
- 浏览器产物复刻树内 `clientBundle` preset 的 `window.__ModuleLoader__.load` 包装(基线 47f94385)。
- 开发环:typecheck / lint / test / build / dev profile 安装 / dump-config / WebUI 启动 / 卸载 / tarball / 干净 profile 冒烟脚本。
