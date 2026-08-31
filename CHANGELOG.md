# Changelog

## 1.0.1 — 2026-08-31

刚装上就能打梁。

新香客备 **10 炷**，对话还能继续攒。同一台机器当天重装或换号，不会再领一份。

发 npm / GitHub Release 时，下面四条就是本号对外主文案。

### 见面礼

- 刚装上送 10 炷。按设备指纹、每个业务日最多领一次；同日重装 / 换号不再送。
- 对话攒香叠在这份见面礼上，不是二选一。
- 没有指纹的环境（部分虚拟机）不送。已在用、且有指纹的香客，升级后当天第一次拉社区状态也会拿到一次。

### 欢迎页

- 字少，先看见见面礼，再看见「点一下一炷，长按两秒倾炉」。
- 仍须自己选在线或离线。倒计时本来就已经去掉了。

### 安装

- 安装包不再声明 `engines.node`。梁相不跟特定 DSH / Node 号绑定。
- DSH 宿主自己若要求 Node 22.19+，仍由 DSH 决定。

### 货架

- 仓库根增加 `screenshots.json`。awesome-dsh-plugin / dsh-market 换截图只需推本仓，不必再开 PR。

## 1.0.0-u1 — 2026-08-26

社区后台更新。客户端 / npm 仍为 `1.0.0`，不发 `1.0.1`。

- `/v1/health` 与 `liang version` 增加 `server_build`（本号 `1.0.0-u1`）；部署标记第一段改写此后台号。
- `liang cases retitle` 原地改今日题目，票数、香客和 `case_id` 保留。
- 题库换成 19 道新梁案；队列用尽后按新表循环。

## 1.0.0 — 2026-08-24

梁相首个正式版本。安装与升级同一条命令，走 npm `latest`，不再对外写 `@beta`。梁祠、身份与今日香火均保留。

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
```

- 正式通道：Host 把精确号、本地 tarball、残留 `beta` 改写成 `latest`，并继续排除本包的 pnpm 24 小时冷静期。启动不跑 `pnpm add`。旧书签 `add @beta` 仍能装到 1.0.0（`beta` 标签同时指向本号），文档不再教 `@beta`。
- 0.8.7-beta～0.8.19-beta 未上 npm 的用户可见改动随本号进入正式通道（中间号不补发）：长按倾炉（满 2 秒倒空，提前松手撤销）、梁小号、此身香火、空炉提示、亮主题拉键青雷，以及启动观察 / 重放 / pointer 等记账修复。

## 0.8.19-beta — 2026-08-24

- 倾炉必须按满 2 秒才倒空；蓄力后提前松手撤销，不再把香炉倒光。短点仍是一炷。

## 0.8.18-beta — 2026-08-24

- 亮主题长按拉：倾炉改走寒钢底与青雷，不再套夯的提亮白字，浅底上才看得清。

## 0.8.17-beta — 2026-08-24

- 三界香火悬停增加「此身香火」：本机今日/累计炷数、夯拉比，以及占梁份额；只写浏览器，不入天庭，不是第五区。

## 0.8.16-beta — 2026-08-24

- 启动观察按到达顺序重放，不再把 catch-up 基线折叠成最新一条，避免插件启动前的用量被从零计入。
- 幂等重放的 used/remaining 取当前账面，不再和后续投票打架；`pointercancel` 只中止长按，不再误投。
- 合成/读屏 click 可以投票；倾炉标签封顶 500；校验失败不再把磁盘错误说成 400。

## 0.8.15-beta — 2026-08-24

- 梁小号中间的圆点改成几何点，和左右文字垂直居中，不再用偏下的放大 `•`。

## 0.8.14-beta — 2026-08-24

- 空炉提示改成一行 `香炉空了，先去攒香`，只亮 3 秒，随后回到梁小号，不再长驻。

## 0.8.13-beta — 2026-08-24

- 空闲行栏目改为「梁小号」，不再写「小梁号」。

## 0.8.12-beta — 2026-08-24

- 长按满 2 秒自动倾炉。
- 空闲反馈行写成 `小梁号：焚尽 • 死夯梁`：统一标题，中间圆点加大；本机梁号随业务日清零，和今日香火同一天。

## 0.8.11-beta — 2026-08-24

- 长按夯/拉不再空等松手：满 3 秒自动倾炉并松开按钮；提前松手仍按原阈值结算。

## 0.8.10-beta — 2026-08-24

- 长按倾炉：约 280ms 即武装，按钮改标 `倾炉 ×N`，炉火从下往上烧、霹雳抽打，松手后整行闪一记。长按不再被系统菜单当成单击只投一炷。
- 投票按钮略收至 38px，反馈行改为 22px / 12px，倾炉结果和本机梁号都读得见。

## 0.8.9-beta — 2026-08-24

- 长按夯/拉一把梭：一次请求带 `count`，服务器按每分钟 50 炷、最多攒 500 炷裁切，不再连发几百次 HTTP。按住越久闪电和震动越强；下方小字提示投了多少。
- 本机梁号：按投香量和夯拉比叠两个称呼（如 `勤香·死夯梁`），只写在浏览器里，占用原来的反馈行，不进天庭账本。

## 0.8.8-beta — 2026-08-20

- 上香反馈行改回固定高度：空闲也预留同一行，不再因「已上香」闪现把面板撑高。
- GitHub `README.md` 改回产品说明；npm 简介页专用文案放到 `docs/npm-readme.md`，打包时再换进去。

## 0.8.7-beta — 2026-08-20

- 今日梁案面板收紧空闲态高度：投票反馈行无内容时不再占位，底栏贴住按钮，卡片上下内边距减小。梁子、香火环和 44px 投票按钮尺寸不变。

## 0.8.6-beta — 2026-08-18

- 安装命令回到浮动的 `@beta`，不再钉死某一号。插件本身没有收窄的版本范围。
- Host 启动时把 DSH profile 的依赖改成 `beta`，并写入 `minimumReleaseAgeExclude: dsh-liangxiang`，避开 pnpm 11 默认 24 小时冷静期。开发用的 `link:` / 非 tarball `file:` 不动。
- 入梁券在每个业务日 0 点（开当日梁案时）检查库存，剩余认领低于 1000 则只补差额。白天领完不会立刻补。`liang tickets replenish` 可手工补一次。
- `liang version` / `liang status` / `/v1/health` 报告程序版本。部署标记写成 `程序号 git 时间`。
- Host 不再持续打 DSH 控制台。精简日志写入 `$DSH_HOME/logs/liangxiang.log`，文件最多 5MB。
- Region 4 统计（三界香火 / 五行香客）统一用全逗号千分位，去掉只在 1 万以上才触发的「万」压缩，避免两列格式不一致。

## 0.8.5-beta — 2026-08-18

- npm 简介页右侧 Install 栏是网站写死的 `npm i`，无法替换。本版 README 开头直接给出 `dsh plugin add`，并写明右侧那条命令不会进入 DSH。
- 从目录发布，确保 registry 收录 README；`0.8.4-beta` 的包内有 README，但 npm 页面没挂上。

## 0.8.4-beta — 2026-08-18

- 0.8.3-beta 发布后又改了 Host/Client/后端源码，按版本纪律升号重发包，不再把新行为留在旧号上。
- 后端校验失败不再把内部错误字符串回给客户端。
- npm / GitHub 首页 README 改成给安装者看的短说明：是 WebUI 插件、不要 `npm i`、一条 `dsh plugin add`。实现细节留在 `docs/`。

## 0.8.3-beta — 2026-08-18

### 版本号、npx 安装与本地包路径

- 用户可见改动必须同时升高 `package.json` 与界面 `PLUGIN_VERSION`；本轮升为 `0.8.3-beta`，不再把新行为留在旧号上。
- `update-plugin.sh` 在没有全局 `dsh` 时自动改用 `npx --yes @deepseek-ai/dsh`。
- 本地 tarball 写成 `./dsh-liangxiang-<version>.tgz`。少写 `./` 时 pnpm 会去 npm 拉同名包并报 `ERR_PNPM_FETCH_404`。
- 安装子命令是 `plugin add`，不是 `web add`。
- npm 介绍与 [liang.today](https://liang.today/) 对齐：短描述改为官网导语，README 去掉现实人名，仓库地址为 `liang-today/dsh-liangxiang`。
- 运维新增 `liang archive clear --yes`，用于正式发布前清空历史梁祠。
- 运维新增 `liang cases reset --yes`（今日回到待开梁）和 `liang tickets replace --yes`（作废可用券后按数量/次数重发）。
- 部署脚本不再把生产 SSH 目标写进仓库；必须从环境变量或本机 `.env` 读取 `LIANGXIANG_DEPLOY_SSH`。
- 校验失败不再把内部错误字符串回给客户端。

## 0.8.2-beta — 2026-08-18

### 独立离线玩法与手动模式配置

- 「梁相案牍」移除“入口归位”，改为随当前状态显示“离线模式 / 在线模式”；切换必须由用户确认，断网、超时、后端重启和自动重连永远不会触发模式切换。
- 在线社区与离线玩法完全分账：社区身份、在线 claim 与共享防重水位保存在 `liangxiang.json`；离线凝香、打梁、梁案进度和梁祠档案保存在按需创建的 `liangxiang_local.json`。
- 模式选择由 Host 持久化，DSH 重启后仍保持；切回在线必须先成功连上天庭，否则继续留在离线模式。
- 切换过程串行化并暂存切换窗口内的 Token 观测；两种模式共享累计会话高水位，防止同一段 DSH 用量在两边各凝一次香。
- v0.8.1 及更早版本混存在主存储中的本地账本首次进入离线模式时会非破坏性复制；旧行保留作回滚备份，不再参与离线计算。
- 离线梁案序号、日梁、周梁、月梁全部持久化；跨多日重启恢复时先补齐所有日档，再生成完整周/月档。
- 更新脚本同时备份并校验两个存储文件；包、界面与当前发行文档统一为 `0.8.2-beta`。
- 源码仓已从 `liang-today/dsh-liang-meter` 迁移并重命名为 `liang-today/dsh-liangxiang`；`package.json` 的 repository / bugs 地址同步更新。
- DSH 开发依赖与 Web 界面层统一钉到 `0.1.0-rc.7`；实际使用的 Host/Client 触点与社区 master `99f6f02` 对齐。
- 在线启动不再等待天庭 bootstrap：Host 立即提供连接中状态，首次探测 3 秒超时后告警并进入主界面，后台继续重连；切回在线仍须先连上。
- 同一安装每分钟最多提交 50 炷香火；首次欢迎页不再倒计时，必须由用户选择在线或离线；案牍版本按钮只显示版本号。

## 0.8.1-beta.0 — 2026-08-18

### 静态复核修复与公网收口

- Caddy 反代后的客户端地址只在回环代理来源下读取有效单值 `X-Forwarded-For`，身份 miss 限流与审计日志重新获得真实来源维度；代理错误日志删除签名、公钥、安装标识、指纹与时间戳请求头。
- 首次安装遍历公开券列表；整页券在并发中被抢完时最多再刷新两次，避免库存仍充足却误报无券。
- 429 使用明确 `vote_rate_limited` 并保持 429 穿过 Host；确定性 4xx 不再无意义重试，未知身份请求实际进入有界 miss 限流。
- `ALLOW_UNSIGNED` 只能绑定回环地址；旧共享口令通道从 Host、后端、脚本和部署配置中删除，入梁券成为唯一首次准入。
- 本地玩法不再由浏览器旧偏好自动切换整台 Host；显式切换使用 JSON + 自定义动作头，普通跨站表单不能触发。
- 梁祠低高度布局压缩留白和头像，六周月份仍完整一屏、称谓不裁切；窄屏只允许横向滚动。
- 首次水合跨整炷边界直接对齐权威 Token，外推不越过下一炷，避免“下一炷”在初始化时从百万级数字跳动。
- 一键更新脚本改用 tarball 内容哈希缓存，修复 DSH 对同版本重构包错误返回 “Already up to date” 的问题。
- npm `0.8.0` 已不可变；本轮源码升为新的 `0.8.1-beta.0` 候选，不覆盖或冒充旧包。

## 0.8.0 — 2026-08-18

### 正式入梁券与发布收口

- 首次安装改为自动领取公开、短期、限次的入梁券，并以客户端自铸 Ed25519 密钥签名认领；已登记安装后续只使用签名，不再取券。
- 生产节点关闭共享社区口令；重装恢复继续走带冷却和每日次数限制的 rekey，不重复消耗入梁券。
- 后端新增全局认领限流、入梁券库存/发行/作废命令及 SQLite v5 表；服务器已准备 1,000 次可用认领库存。
- 断连状态改为「无法连接天庭：原因」；梁相案牍点外收起，当前版本入口集中到案牍；梁祠称谓增加防溢出与窄窗纵向滚动兜底。
- 梁案题库更新为 14 道正式排期，并增加原子替换整张未发布排期的运营命令。
- 发布前移除旧测试节点的个人登录名与内网地址；树莓派重置脚本改为要求运营者显式提供未提交的环境变量。
- `dsh-liangxiang@0.8.0` 已发布到 npm，正式试用入口固定写为 `dsh-liangxiang@beta`；GitHub Release 暂不发布。

## 0.7.2 — 2026-08-18

### 版本入口与悬浮避让

- 移除喇叭长按显示版本的隐藏手势；声音按钮恢复为纯粹的音量循环控制。
- 「梁相案牍 → 当前版本」点击后弹出独立版本信息层，支持按钮关闭与 Escape 返回。
- `今日梁相` 悬浮提示始终显示在展开面板的相反方向，面板在上则提示在下、面板在下则提示在上。

## 0.7.1 — 2026-08-18

### 交互修整与梁相案牍

- 无香火时，夯使用“试图上扬后坠落”的空炉声，拉使用连续低落声；两者均不发送投票。
- 首次安装欢迎页新增独立题签「梁相还得梁人出！」。
- 日常 Token 声明、快照、重连与档案刷新继续自动完成；原主位手动对账入口改为主题化「梁相案牍」，收纳主页、异常核香、入口归位和当前版本。核香保留二次确认并明确只用于异常修复。
- 梁祠六周月份维持同一弹窗高度，只缩小头像和格内留白，日梁、周梁称呼不再被压缩或裁切。

## 0.7.0 — 2026-08-18

### 断连恢复与显式本地玩法

- 浏览器到 DSH Host、DSH Host 到社区后端均增加有界指数退避自动重连；普通断网和 DSH 重启不再要求手动刷新。
- 社区断连时继续记录本机 Token 水位和今日凝香，但锁定夯拉；恢复后自动向后端核对并提交累计水位，绝不暗切本地模式。
- 只有显式配置 `LIANGXIANG_BACKEND_URL=local` 才进入“自己玩（本地）”；无效在线地址回退到正式社区地址而非本地账本。
- 新增保留 `storages/liangxiang.json` 的更新脚本：更新前自动备份并核对安装过程没有改写身份或水位。

### 运维、梁案与梁祠

- 香港节点新增统一 `liang` 命令，可查服务、版本、健康、今日梁案、梁位、未来排期和日志；安全配置修改带校验、备份、健康检查及失败回滚。
- 内置 34 道候选梁案，支持按业务日期批量排入至少 10 道；重复标题、重复日期和虚假日期均拒绝。
- 梁位六位小数改用精确整数运算，大基数下不受 JavaScript 浮点精度影响，仍按产品契约截断而非四舍五入。
- 梁祠按月份实际生成 4、5 或 6 行，一屏完整显示；弹窗高度跨月份稳定，桌面端不再出现上下滚动条。

## 0.6.0 — 2026-08-18

### 香港节点与命名空间定稿

- 代码、配置、存储、路由、部署脚本、测试与文档只允许使用 `liangxiang / 梁相`；一次性品牌过渡读取已经结束。
- 标准部署目标切换为香港节点的密钥专用账户；构建在无特权账户中完成，安装、SQLite 在线备份和服务切换才临时使用 `sudo`。
- 新增 SSH 最小权限基线和受审计的部署账户权限模板；后端继续只监听回环地址，由 Caddy 提供 HTTPS。
- 构建前由唯一配置清理共享 `lib` 输出目录，避免历史哈希 chunk 留在服务器或审计目录。
- 后端 systemd 沙箱清空全部 capability，限制进程、地址族、系统调用和出站地址；仅允许本机 Caddy 通过回环地址访问。

## 0.5.0 — 2026-08-18

### 品牌与技术标识统一为「梁相 / liangxiang」

- 对外产品名由过渡称呼定稿为「梁相」，入口改为「今日梁相」，主叙事冻结为“众香成势，梁子显相”。
- npm 包、Host 名、客户端 bundle、Host API、CSS/data attribute、日志、环境变量、存储域、开发 profile、部署目录、systemd 服务和发行包统一迁移到 `liangxiang`。
- v0.5 将配置、DSH 存储域及浏览器偏好写入统一的 `liangxiang` 命名空间。
- 社区 VPS 的标准部署脚本增加 SQLite 在线备份和验证后写入版本戳。

### 发布安全收口

- 投票限流状态增加 4,096 个活跃身份的硬上限，身份变更限流同样有界；一次性伪造身份不再令内存表无限增长。
- 429、拒票、幂等重放、无效 claim 与鉴权拒绝改为按原因采样，首次有效投票仍保留逐票审计，阻断日志放大。
- 分发包不再引用本机烘焙的社区口令；闭测口令只能由进程环境提供。
- systemd 单元增加设备、内核、控制组、命名空间与权限提升限制。

### 梁案排版与凝香反馈

- 今日梁案正文扩至面板完整内容宽度，声音与关闭按钮只占用上方标题行，不再让正文过早换行。
- 凝香反馈保留单次状态更新的实际增量；一次增加多炷时显示 `凝香 +N 炷`，首次在线水合仍不误报。

### 品牌主题统一

- 对外产品名经过一次过渡命名后最终定稿为「梁相」；悬浮入口改为「今日梁相」。
- 个人左翼改为「今日凝香」，个人环对外统一称「香火环」；按钮收敛为 `夯 · 升梁` / `拉 · 降梁`，成功反馈改为 `已上香 · 夯/拉`。
- 三界香火、五行香客、当时的手动核香入口与进入梁祠保持不变；全产品视觉母版统一为“现代编年志 × 克制梁祠”。
- 明确允许待开梁肖像内“牢梁”牌匾及五态同名胸牌作为装饰彩蛋；它们不进入状态、数据或可访问性文案。
- 新增 `docs/140-liangxiang-brand.md`，冻结故事、宣传口径、非官方声明与软信任边界。

### 连不上社区后端时不再标成「本地」

- 占位帧改为在线口径。`This operation was aborted` 改写为明确超时；bootstrap 失败指数退避，避免每秒刷屏。

### 首次安装默认在线

- 健康检查失败不再悄悄切成本地。新设备默认连社区后端。
- 首次欢迎页确认是否改用本地：发呆 10 秒后进入在线；同一页小字说明只使用随机安装 ID，不收集对话或账号。

## 0.4.0 — 2026-08-17

### 梁祠

- 第四区新增 `进入梁祠`，在插件内打开月历浮层；今日使用专用「今日进行中」图标，历史日显示日梁，每行右侧显示周梁，标题区显示月梁。
- 当前周与当前月只按截至昨天的已封存日梁生成暂梁，周一/月初无历史时显示待积；暂梁不写永久档案。
- SQLite schema 升至 v4：日切幂等封存日梁，同日多梁案合并；完整结束的 ISO 周与自然月封存永久周梁/月梁。聚合统一按原始夯/拉票数加权，零票、无档、未来与今日严格区分。
- 新增严格 `/v1/history` 与本机 `/liangxiang/api/history` 冷通道：首次全量，`archive_version` 变化后只拉增量；今日 snapshot/SSE 只带版本标量，不重复推送历史数组。
- Host 与浏览器各自保留 last-known-good 历史；历史服务失败显示 `档案未更新`，不影响今日梁案、香火或投票。
- 梁祠视觉复用现有梁子六态、主题 token 与图标语言；完成暗色、窄屏横向滚动、Tab/Shift+Tab 焦点陷阱、Escape/焦点归还及 reduced-motion 适配。

### 工程

- 新增归档领域、wire、数据库/HTTP/Host/client 集成测试；真实日期校验拒绝不存在的 Gregorian 日期。
- 包版本与界面长按显示同步为 `0.4.0`。GitHub Pages 仍不进入本阶段范围。
- staging 部署在迁移前使用 SQLite 在线 backup 保存含 WAL 的一致快照；远端构建、服务重启、health/history smoke 全部成功后才更新 `VERSION`，避免失败发布伪装成新版本。

## 0.3.0 — 2026-08-17

### 规则与计量

- 梁子五态门槛正式冻结为 50/70/85/95%，同步活契约、产品冻结、执行手册、领域文档与边界测试。
- 模型权重改为仅精确 `deepseek-v4-pro` ×1；V4-Flash、其它、缺失/未知模型全部 ×0.5。权重策略版本升为 `incense-weight-v2-pro1-others0.5`。

### 交互与视觉

- 香火为零时，夯/拉按钮保持可聚焦和可点击的 `aria-disabled` 状态：点击不发请求，只播放短促搞怪“空香炉”声并显示提示；离线仍原生禁用。
- 悬浮入口调整为 48px 点击区＋42px 当前梁子，增加静止梁祠底座；唯一常驻动效仍是人物层按梁气进度上下弹跳。
- 主面板固定 256px，精确对齐 DSH 默认 280px 侧栏扣除两侧 12px 内边距后的内容宽；重做层级、留白、暖金/朱砂/冷灰配色、按钮按压和开场动效。
- 面板拖到右边缘时自动改为右缘对齐；≥1000 香火光晕不再无限脉冲。

### 发行纪律

- 包版本与界面长按显示统一为 `0.3.0`，增加 manifest 一致性测试。`pnpm pack` 产物名自动为 `dsh-liangxiang-0.3.0.tgz`，Git Tag 使用 `v0.3.0`。
- 新增 `docs/BUGFIX.md`，集中记录后续修复提醒。

## 0.2.2 — 未发布

### 打梁：旧门槛快照不再 502

- 社区后端若仍按 20% 带把 ~45% 标成梁神，本机新门槛期望梁工。原先整包拒收，票已收下但 UI「打梁失败」、梁位冻结。现按同一票数用本机策略重算称呼。

### 当量不再带 ≈ 和小数

- 下一炷可见数字改为整数 compact（`33K`），避免和中间梁子重叠。精确值仍在悬停 / 读屏。

### 文案打梁

- 失败/拒绝提示与模式说明不再说「投票」。

### 默认在线，不行再落本地

- Host 默认连社区后端。`LIANGXIANG_BACKEND_URL=local` 或健康检查失败才用进程内假账。本地标题为 **今日梁案（本地）**，并可「换一案」轮换预备题目。

### 下一炷三行对齐

- 与今日凝香同一套 caption / 橙色数字 / 第三行；第三行是「已攒 n%」。

### 梁子越上越难

- `<50%` 梁工；`50/70/85/95` 以上越来越窄。梁圣 85–95%，梁祖 ≥95%。策略 `liangzi-v0.1-50-70-85-95`。

### ≥1K 炷改为光晕

- 环上太阳不再堆；1000+ 只留加强发光的 compact 炷数。再涨只加今日凝香数字。

### 密钥与梁案

- 运营改案 / 解绑只走 VPS CLI（`node lib/backend-cli.js`），HTTP `/v1/admin/*` 关闭。
- 用户可用自己的私钥 `POST /v1/identity/revoke` 删钥。命中 10 分钟一次（IP+钥）；未命中当攻击，同 IP 30 分钟一次。指纹接管默认冷却 30 分钟。见 [`docs/122-identity-recovery.md`](docs/122-identity-recovery.md)。

### 硬刷新不再弹出凝香

- 第一次 live 帧只记 earned 基线。Cmd+Shift+R 从 0 水合到真实炷数不再误播凝香提示。梁子浮动与下一炷数字仍可照常出现。

### 音量默认关，切换时预听

- 未存过偏好则为静音。点图标循环 无/小/中/大 时，用该档增益播一声预听（静音不响）。

### 今日凝香 / 下一炷同一套字

- 当量数字与今日凝香同为橙色加粗、同行高；单位行高对齐。

### Git 硬规则

- 每次完成的改动必须立刻 `git commit` + `git push`。写入 `.cursor/rules/git-commit-push.mdc` 与 `AGENTS.md` §15。

### 梁子等比例阶梯

- 五态改为 0–100% 等宽 20% 带：`<20` 梁工 / `<40` 梁总 / `<60` 梁神 / `<80` 梁圣 / `≥80` 梁祖。升梁与降梁同一档距。策略版本 `liangzi-v0.1-20-40-60-80`。

### 三界 / 五行悬浮

- 不用原生 `title`。悬停与键盘聚焦弹出同一张卡：标题 + 今日/累计两行精确整数。

### 音量图标

- 小/中/大三档同心声波，第三档不再是被裁掉的扁弧。

### 去掉演示 +1 炷

- 面板探测按钮与 frontend overlay 删除。本地假账仍可用 `pnpm run dev:credit`。

### Host 重载不再把旧会话累计再申报一遍

- 用量观测和持久化分两个 DSH inject。补扫已经把水位抬到当前累计之后，hydrate 若整表替换成磁盘上的旧水位，下一次 `firstLiveSeq === 0` 的 live 事件会把整段会话再记进今日。hydrate 改为按高水位合并，闲置重连不会凭空 +N 炷。

### 在线香火刷新

- 在线 Host 按后端 `business_date` 桶化本机 Token 观测，时区不一致时香火不再读成 0。手动账本修复之后新增用量加在服务端 claim 之上，不再被 `max(claimed, local)` 吞掉。浏览器在 Host 重启后仍接受新的低 revision 帧。

### 下一炷可见数字

- `formatCompactCount` 在整个 K/M/B 档保留一位小数（`33,421`→`33.4K`，不再从 10K 起收成整数 `33K`）。环 fill 本来就会动；右翼数字必须跟着攒香走。精确值仍在 `title` / `aria-label`。

### 模型加权攒香

- 投票仍对着今日梁案。本地按 DSH 精确路由 ID 给用量增量加权：`deepseek-v4-pro` = 1，`deepseek-v4-flash` = 0.5。上报仍是当量 Token，服务器协议不变。
- 面板「下一炷」可见单位为 **当量**（Pro 口径，不是原始 Token）；悬停/聚焦弹出权重表（Pro ×1 / Flash ×0.5）。环上香火是分轨 **字形**：炷=香柱、月=月牙、日=日轮，绕环排列（底部给梁位留空）。9 炷就是 9 根香，不再是顶弧上挤成一团、看起来像 8 个的小圆点。≥1000 用缩写数字。两翼改为 9/11px caption，具象交给环 fill 与字形。面板宽 336→252，overflow 可见以免裁月牙。
- 主面板与入口 logo 一起上下浮动（各态都飘，不只梁神/圣/祖）。只动人物层；浅灰 JPEG 底抠成透明 PNG。浮动快慢跟下一炷 `liang_qi_fill`：空则停，快满则快。

- 在线模式下，「今日凝香 / 下一炷 / 香火环」改为跟本机 Token 观测走：DSH 用量一到，面板立刻动，不再等 1s claim 防抖 + 公网往返。投票扣香仍以服务端账本为准。

### 运营发布梁案

- `POST /v1/admin/cases`（社区口令）：归档当前 active 案、开新案、全网从待开梁计、清当日已用香火（Token 声明保留）。同日可多次发布；任意时刻仍只有一个 active。
- 香客发现新案走现有 1s `GET /v1/snapshot`（响应含 `active_case`；id 变则 Host re-bootstrap + 本机 SSE）。不是 VPS→Host WebSocket。悬停/打开面板可 force refresh。VPS curl 见 [`docs/121-vps-deploy.md`](docs/121-vps-deploy.md)。

### 后端安静访问日志

- 只打 hello / 新攒香火 / 投票结果 / 鉴权失败。不打 health、snapshot、daily-state 轮询。`journalctl -u liangxiang-backend -f`。

### 社区软信任上公网（Ed25519 + 香火 drip + VPS）

- **安装身份**：每次安装生成 Ed25519 密钥对（私钥留 Host，公钥进 `community_identity`）。请求签名；可选 MAC 集合哈希绑定，挡住同一台机器轻易重装。这不是 DSH 认证，也不是反女巫。
- **香火 drip**：默认每分钟最多接受 50,000 声明 Token（= 1 炷）。防瞬间自报天文数字；不能证明 DSH 真跑过。时间用服务器时钟，启动时向硬编码 NTP 告警偏移。
- **公网鉴权**：默认拒绝未签名请求；可选 `LIANGXIANG_COMMUNITY_KEY`。VPS 配方见 [`docs/121-vps-deploy.md`](docs/121-vps-deploy.md)（systemd + Caddy）。仍禁止声称 verified。
- **文案**：`STAGING_MODE_NOTE` 改为社区软信任说明，不再说「本地预发」。

### 社区产品方案（未开工）

- 选定 [`042`](docs/042-auth-trust-model.md) 路径 ③：不等 DSH 可验证身份，把 RC Demo 做成社区软信任产品。方案见 [`docs/120-community-product.md`](docs/120-community-product.md)。下一步是 C1（能发给朋友），需明确授权非 localhost 后端与 GitHub Release。

### 两翼计数缩写

- **两翼计数**：`formatCompactCount`——`0–999` 原样，`1,000+` 四舍五入为 `K`/`M`/`B`（`3,000`→`3K`，`46,935`→`47K`，`1,234 炷`→`1.2K`）。这是防呆：默认 50K Token/炷时香火涨得慢，但两翼只有 64px。精确值仍在 tooltip 与屏幕阅读器里。梁位继续截断、不四舍五入。

### 居中修复 + 投票文案还原 + git push 站立指令

- **梁子必须正中**：Region 2 不再用 flex `space-between`。环、头像、环上香火点是唯一占文档流宽度的列，水平居中；「今日凝香 / 下一炷」绝对定位 overlay，文案长短不能把梁子挤偏。
- **投票按钮**：`夯 · 升梁` / `拉 · 降梁`，`1fr / 1fr` 等宽标齐。投票类型仍只有 `up`/`down`。
- **Git**：`AGENTS.md` §15 覆盖 Prompt 4/11「禁止 git push」——每次改完提交并立即 push。仍禁止 npm publish / GitHub Release / 公网部署 / 改真实 DSH profile。
- 禁令差异表：`docs/110-prohibition-refresh.md`。**已按「全部刷新」回写** `PRODUCT_FREEZE_V0.1.md` 与 `LIANGXIANG_CURSOR_MASTER_R3.md`。

### v0.1 Release Candidate（本地加固与终审）

- **布局稳定性**：两翼与统计项改为固定宽度 + `tabular-nums`，数值变化（`5 炷`→`12 炷`、`3,000`→`46,935`）不再把中央梁子挤偏;梁位药丸固定宽度。
- **梁位**：小数从 4 位增到 **6 位**（大盘下 4 位会「冻住」）；被接受的投票**在自己的事务里发布快照**并随响应带回，梁位在点击那一下就动（不再等 cadence、不多一次往返）；数值变化时播放一次短促 pop 动效，`prefers-reduced-motion` 下不播。
- **加固修复**：干净 profile 冒烟脚本在产物变大后必然失败（`curl | head -c` 写错误 + `pipefail`）—— 发布验证路径本身是坏的，已修；后端限流表按可自造的 installation id 无界增长，已改为超阈值清扫并加洪泛回归测试；`assertValidCase` 参数改名以免污染语义扫描。
- **发布文档集**：新增 `RELEASE_CHECKLIST.md`、`CONTRIBUTING.md`、`SECURITY.md`、`docs/{100-release-readiness,101-threat-model,102-known-limitations,103-test-matrix,SECURITY,PRIVACY,DATA_FLOW,INSTALL,TROUBLESHOOTING,COMPATIBILITY}.md`;README 换成冻结的核心描述与文档导航。
- **RC**：`dsh-liangxiang-0.1.0.tgz`（sha256 `3123a117…9bdc3`），257 项测试全绿、两个冒烟全通、`pnpm audit --prod` 无漏洞、包内容仅 6 个预期文件。结论：本地/staging **Go**，公网与「可信」表述 **No-Go**（由后端启动门禁强制）。

### 交互改版：近实时梁位 + 单值小数 + 自由放置徽章

- **近实时**：快照 cadence 默认 300s → **1s**（backend 与 host 下限同步到 1s），投票被接受后 Host 立即再拉一次快照，投票者约 1 秒内看到梁位变化；`public_liang_snapshot` 加入 200 条保留上限（同事务裁剪）。个人余额新增每 5 tick 的 `/v1/me/daily-state` 回读，带外改动（另一标签/另一 Host）也会收敛。
- **单值梁位**：Region 2 改为「左=剩余香火 `N 炷`｜中=梁子+香火环｜右=距下一炷 `X Token`」，梁子下方只留一个全局数字 `梁位 83.021952%`（6 位小数，仍是截断不四舍五入，所以不会越阈值）。`拉` 不再占第二个大数字，只在 tooltip 与屏幕阅读器摘要里出现。理由：两个互补整数百分比让「投一票 90% 还是 90%」，单值+小数每票都动。
- **自由放置徽章**：入口图标改为**当前梁子五态头像**（不再是「梁」字），可指针拖拽到画面任意位置，坐标夹回可视区并存 `localStorage`（纯外观偏好）；拖拽超过 4px 时吞掉随后的一次 click，所以拖完不会误开合面板；面板按剩余空间自动翻转左右、贴边时改垂直锚点。
- AGENTS.md 的 Region 2 / §4 / §12 与 docs/020、032、070 已按上述新契约更新;新增/改写 20 项测试（布局、单值小数、放置数学、近实时、保留上限、余额收敛），总计 251 项全绿。

### 测试环境修复 + 安全审计

- **修复 dev profile 的工具调用崩溃**：`dsh plugin add @deepseek-ai/dsh-web-app` 把 in-box 闭包装进 `<profile>/node_modules`，遮蔽了 launcher 的 `profiles/node_modules`，导致 `@deepseek-ai/dsh-tools` 在一个进程里有两个模块实例——两个 `TOOL_RUNTIME_SCHEDULER` symbol，于是 `dsh-agent-loop` 每次工具调用都拿到 `undefined`（`Cannot read properties of undefined (reading 'prepare')`），并把会话留下无结果的 `tool_calls`（后续报 "must be followed by tool messages"）。`dev-install.sh` / `smoke-clean-profile.sh` 现在只保留 bundle 行、移除该依赖，并用新增的 `scripts/assert-profile-modules.mjs` 断言单实例。
- **超限请求体改为 413**：`/v1/*` 与 `/liangxiang/api/vote` 不再 destroy socket（被掐断的连接与网络故障不可区分，会诱发错误重试），改为结构化 413 + `connection: close`。
- 60 项即席并发/安全审计全过：200 并发抢 1 炷只成功 1 次、200 并发抢 50 炷恰好 50 次、50 并发同 request_id 只扣 1 炷、claim 与扣香并发下 `used<=earned`、并发读快照全部自洽；身份头（缺失/超长/穿越/注入/unicode）全部 401、投票体自报权威字段全部 400、SQL 注入按字面量处理且五张表完好、异日与更小 claim 被忽略、被拒的 request_id 不被污染。

### Backend + Online Integration（Phase 3，localhost / DEV_STAGING_ONLY）

- **Authority 模式锁定**：Decision Gate A3 ⇒ `AUTHORITY_MODE=DEV_STAGING_ONLY`。后端对 `VERIFIED_PRODUCTION` 拒绝启动，wire 的 `AuthorityMode` 联合类型不含该值，个人状态恒带 `claim_source: host_observed_unverified` + `claim_verified: false`（见 `docs/075`）。
- **后端**（`src/backend`，零新增依赖：`node:http` + `node:sqlite`）：schema v1（`daily_liang_case` / `daily_incense_state` / `liang_vote` / `daily_liang_stats` / `public_liang_snapshot`，一个业务日一个 active 案由 partial unique index 保证，`used*tpi <= claimed` 由 CHECK 兜底）；`/v1/bootstrap`、`/v1/token-claims`、`/v1/votes`、`/v1/snapshot`、`/v1/me/daily-state`、`/v1/health`；投票事务 `BEGIN IMMEDIATE` + 条件 UPDATE（CAS 扣香）+ `UNIQUE(installation_id, request_id)` 幂等 + 首票香客 +1；快照按 cadence append-only 发布，比例与梁子状态由同一行派生。
- **Host 在线化**：`LiangHostService` 接口让 `/liangxiang/api/*` 同时服务两种模式（浏览器 wire 形状不变，UI 零改动）；`BackendLiangService` 上报 token claim（debounce + 单调 ratchet）、拉取快照、日切自动重新 bootstrap；`UsageProjection` 抽出本地观测；自铸假名 installation id 持久化于 storage domain `identity` 表（不复用 DSH 匿名 id）。
- **诚实标注**：新增 `STAGING_MODE_NOTE`，面板 `data-liangxiang-authority` 与屏幕阅读器摘要按模式播报真实信任边界。
- 新增 56 项测试（后端事务/HTTP 并发/幂等/多标签/日切/快照版本、Host↔Backend E2E），总计 236 项全绿；新增 `scripts/smoke-online.sh` 全链路冒烟（50 并发只接受 1 票）。
- 文档：`070` 架构、`071` schema、`072` 事务与并发、`073` 业务日、`074` authority 数据流、`075` 决策与生产阻塞项、`076` `/v1` API。

### UI 修正（Phase 3 前）

- 比例显示与阈值对齐：`formatRatioPercents(upVotes, downVotes)` 与梁子状态同源于快照原始计数，夯率截断到整数百分点（拉率取补数），修掉 89.6% 被四舍五入成 `90%` 却仍显示梁圣的观感错误;梁圣区间明确为 `80% ≤ 夯率 < 90%`。
- 状态区间可见化：`liangziUpRatioBand` + `liangziRatioRangeText` 从阈值策略推导文案，梁子标签 `title` 与 svg `aria-label` 直接给出精确区间。
- 社会化区放大（15px 文案 / 17px 加粗数值），图标改为 `🪔 香火` / `🙏 香客`（常量集中于 `shared/index.ts`）。
- 梁案标题与内容居中，关闭按钮绝对定位;移除可见「本地演示」徽标，软信任标注改由 `data-liangxiang-authority` 与屏幕阅读器摘要承载。
- 新增 10 项测试（区间、截断、补数、居中、图标、tooltip），总计 180 项全绿。

### DSH Authority Spike + 真实 Token + 本地完整闭环（Prompt 2）

- Authority Spike（docs/040–044）：DSH 无 authenticated user、无服务器可验证 Token 权威;anonymous-user-id 仅假名标识。**Decision Gate A = A3**，生产可信投票标记 BLOCKED（P0 open risk），本地闭环以 `LOCAL_FAKE_DEV` 模式诚实标注。
- 真实 Token 接入：`tokenUsage` 投影观测（启动补扫 + 变更流），每会话高水位差分账本（replay/restart/重放/替换回落均不双计;新会话 `firstLiveSeq===0` 全额计入，resume/fork 基线化），按可配置 business timezone 入账当日，storage domain `liangxiang` v1 持久化（缺席时内存降级）。
- 本地投票闭环：`FakeAuthoritativeLiangService`（同步事务防并发双花、requestId 幂等、首票香客、快照 cadence 发布——比例与梁子状态同 sequence）、`/liangxiang/api` HTTP+SSE 通道（边界校验、body 上限、心跳、卸载清理）、client live store（帧校验、旧帧拒收、同 id 有界重试、离线保留最近状态）。
- 新增 45 项测试（水位账本、服务事务矩阵、wire 边界、live store），总计 170 项全绿。

### R2 语义对齐 + 正确 UI + 领域模型（Prompt 1）

- 业务语义纠偏至 R2 冻结模型：全网夯率驱动中央梁子（待开梁 + 梁工/梁总/梁神/梁圣/梁祖），个人梁气 = 剩余香火 + 下一炷 Token 进度;废弃 梁签/cacheRead×0.1/目标模型口径/per-request cap（见 `docs/SEMANTIC_CORRECTION_R2.md`）。
- 纯领域层 `src/domain`：Token→香火折算（50K=1 炷，可配置）、梁子五态阈值策略（60/70/80/90）、快照一致性（比例+状态同 sequence）、二元投票词汇与幂等 requestId、fail-safe 校验。
- 正确 UI（mock 数据）：面板四区（今日梁案 / 夯比例·梁子·香火环·拉比例 / 夯拉双按钮 / 香火·香客），具象 LiangAvatar 六态原创 SVG，LiangQiRing 整合 `N 炷 · 再 X Token`，键盘/Escape/焦点管理/reduced-motion/明暗主题。
- P0 测试矩阵 125 项（Token 边界、库存、重复/混投、阈值、全局/个人解耦、阈值穿越、零票、非法输入、UI 结构）。

骨架里程碑(不含正式功能):

- 可安装的 DSH out-of-tree bundle:`dsh.bundle`(cordis.patch.yml 插入 Host 行)+ `dsh.client`(platform web)。
- Host 半:仅一个生命周期标记 effect(激活/卸载日志),无用量观测、无存储、无路由。
- Client 半:向 `shell.overlay` 注册一个占位圆点(悬停/聚焦文案 `今日梁相`),无正式 UI。
- 分层:`shared` / `domain`(占位) / `host` / `client` / `compat/dsh`(唯一直接触碰 DSH API 的层)。
- 浏览器产物复刻树内 `clientBundle` preset 的 `window.__ModuleLoader__.load` 包装(基线 47f94385)。
- 开发环:typecheck / lint / test / build / dev profile 安装 / dump-config / WebUI 启动 / 卸载 / tarball / 干净 profile 冒烟脚本。
