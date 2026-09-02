# TROUBLESHOOTING

## 本地启动报 `session_projcache ... does not match its schema`

这不是已有进程。已有进程只会占用端口；先用 `lsof -nP -iTCP:3080 -sTCP:LISTEN` 即可确认。

该错误表示开发专用 `$DSH_HOME/storages/session_projcache/` 里还留着旧 DSH 写入的会话投影缓存。DSH 0.1.2-alpha.4 当前记录身份要求 `isSeeded` 与 `inheritedEventCount`，旧记录没有这两个字段，因此插件树会在梁相加载前中止。投影缓存只是从会话日志折叠出的加速副本，不是会话日志，也不是梁相香火/投票账本。

先停掉开发 WebUI，然后执行：

```bash
pnpm run dev:repair-cache
pnpm run dev:web
```

脚本把旧的 `session_projcache.json` 和 `session_projcache/` 一起移入 `$DSH_HOME/backups/session_projcache/<UTC 时间>/`，避免遗留整单元文件再次引导出不兼容记录。以下内容不会被移动：

- `$DSH_HOME/sessions/`：权威压缩会话日志；
- `$DSH_HOME/storages/liangxiang.json`：社区身份与在线投影；
- `$DSH_HOME/storages/liangxiang_local.json`：离线账本与梁祠。

若 `dev:web` 先报告运行时不匹配，请先切到 Node `^22.19.0` 或 `>=24.0.0`；它只调度现有安装，不要求重装 pnpm。`dev:install` 与干净 Profile 则要求 pnpm `11.7.0`。当前审计/CI 基线是 Node `22.23.1` + pnpm `11.7.0`。

## 设置里找不到插件市场

先退出 WebUI，对同一个 `DSH_HOME` 执行 `plugin --profile web add dshmarket`，再打开并刷新。

注意：DSH 0.1.2-alpha.4 已移除旧的 `installSettingsSection` / `settingsNamespace` 导出。若市场或其他第三方插件因此让整个插件树失败，该版本尚未覆盖 alpha.4，不能靠重装梁相解决。源码联调用隔离的 `liangxiang-dev` Profile，移除其中无关的市场残留；日常 `web` Profile 则应等待对应插件发布明确兼容版本，或暂时使用 CLI 安装包。

```bash
DSH_HOME="$PWD/.dsh-home" pnpm exec dsh plugin --profile liangxiang-dev remove dshmarket
```

## Desktop 里安装成功，界面没有「今日梁相」

命令写进了默认 `~/.dsh`，DSH Desktop 读的是自己的 harness 目录（Windows 上通常是 `%APPDATA%\dsh-desktop\harness`）。先完全退出 Desktop，设好 `DSH_HOME` 再 `plugin add`。详见 [`INSTALL.md`](INSTALL.md) 的 DSH Desktop 一节。

## 重装后案牍仍是旧版本（例如 0.8.6-beta）

profile 里钉着旧精确号或本地 tarball。正式通道应是浮动的 `latest`。先退出 WebUI，再执行和安装相同的命令（不要先 remove）：

```bash
export DSH_HOME="$HOME/.dsh"
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
```

启动一次带版本浮动能力（v1.0.0 起）的 Host 后，`$DSH_HOME/profiles/web/package.json` 的依赖应是 `latest`，不应再是 `file:…tgz`、`beta` 或旧精确号。清单已排除本包的 pnpm 24 小时冷静期，以后升级继续这条命令即可。

若仍钉死：先启动一次让 Host 改写清单，退出后再 `add dsh-liangxiang`。只有旧 Host 从未改写过清单时，才需要 `remove` 再 `add dsh-liangxiang`。

刚发版当天若市场或 pnpm 先拿到了上一个够龄号：启动一次（写入冷静期排除）后再执行同一条 `add`，不要 remove。也可以从 GitHub Release 下载当前公开稳定版 tarball（例如 `./dsh-liangxiang-1.0.7.tgz`）装一次，启动后会自动切回 `latest`。

## 更新脚本提示没有 `dsh` 命令

没有全局安装 DSH CLI。两种用法等价：

```bash
dsh plugin --profile web add ./dsh-liangxiang-1.0.7.tgz
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-1.0.7.tgz
```

`scripts/update-plugin.sh` 现在会在找不到 `dsh` 时自动改用 npx。也可以显式指定：`--dsh npx`。

## 本地 tarball 报 `ERR_PNPM_FETCH_404`

典型日志是：

```text
GET https://registry.npmjs.org/dsh-liangxiang-1.0.7.tgz: Not Found - 404
```

这不是包坏了，是 pnpm 把参数当成了 **npm 包名**。DSH 的 `plugin add` 只是把参数转给 pnpm，而且只有以 `./` 或 `../` 开头的路径才会按你当前目录重写。

会 404 的写法：

```bash
# 少了 ./
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang-1.0.7.tgz
```

能装上的写法：

```bash
export DSH_HOME="$HOME/.dsh"
cd "$HOME/Desktop/liangxiang"
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-1.0.7.tgz
```

## 本轮运行失败：`Cannot read properties of undefined (reading 'prepare')`

**症状**：DSH 里任何用到工具的回合立刻失败；紧接着同一会话报 `An assistant message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'`。

**原因**：profile 里存在**两份**同一个 in-box 包。`dsh plugin add @deepseek-ai/dsh-web-app` 会把该 bundle 的整个闭包（`dsh-tools`、`dsh-session`、`dsh-storage-domain`…）装进 `<profile>/node_modules`，遮蔽 launcher 维护的 `<DSH_HOME>/profiles/node_modules`。DSH 用 `unique symbol` 连接内部接缝（`dsh-tools` 的 `TOOL_RUNTIME_SCHEDULER`，由 `dsh-agent-loop` 读取），两个模块实例就是两个 symbol，查表得到 `undefined`。第二条错误是后果：assistant 的 `tool_calls` 已经写进会话，却永远等不到工具结果。

**诊断**：

```bash
node scripts/assert-profile-modules.mjs <DSH_HOME>/profiles/<profile>
```

会列出被遮蔽的包，并指出哪些 anchor 对同一个包的解析不一致。

**修复**：

```bash
pnpm --dir <DSH_HOME>/profiles/<profile> remove @deepseek-ai/dsh-web-app   # 保留 bundles 声明，去掉依赖
```

然后**重启** WebUI（内存里的旧模块图不会自愈）。已经报错的会话不用删：DSH 在加载时会用同 `callId` 的合成错误结果补齐孤立的 tool call（`packages/core/session/src/repair.ts`），重启后旧会话可继续；想干净就新开一个会话。

## 面板显示「无法连接天庭」

Host 通道不可用，或在线 bootstrap 超时。检查：

- WebUI 终端是否有 `[dsh-liangxiang] host half active` 以及 `DEV_STAGING_ONLY`；
- `curl http://127.0.0.1:<webui>/liangxiang/api/state` 是否 200；
- 在线模式：本机 `curl -m 5 https://api.liang.today/v1/health`（不要只 curl 服务器的 localhost）。

面板会保留最近一次状态继续渲染；重新打开面板会再试一次。

## 面板显示「记账不可用」

DSH 的 `sessionProjections` / `sessions` 没注入（组合里缺插件，或版本变更）。香火环会停在 0 炷；投票按钮因此禁用。查 `COMPATIBILITY.md` 的当前触点表与 `compat/dsh/usage-observer.ts` 的告警。

## 香火一直是 0（在线模式）

先看 Host 日志里的 `business_date`。在线模式以 backend bootstrap 返回的业务日为权威，
Host 会把本机观测桶对齐到该日期；浏览器日期和 Host 本地时区都不能决定在线资格。
若 claim 仍被报 `wrong_date`，说明 bootstrap/claim 跨过了服务端日切或后端配置异常，
应检查服务端 `LIANGXIANG_BUSINESS_TZ`、时钟与重连日志，不能靠改浏览器日期修复。

也可能是当天确实还没产生足够用量：`LIANGXIANG_TOKEN_PER_INCENSE=50000` 表示
5 万 Pro 当量才有第一炷。`deepseek-v4-pro` 权重为 1；Flash、未知和其他 route 权重
为 0.5，因此通常需要约 10 万 raw Input+Output Token。本地演示可以显式调小策略值。

## 打梁报 502 / 「打梁失败」

Host 与后端之间的请求失败。**用同一个 `request_id` 重试是安全的**（幂等域是 `(installation_id, request_id)`，重放不会二次扣香）；换新 id 才会有二次扣香风险，客户端不会那样做。

## Host 日志在哪里

DSH 控制台不再持续打印梁相日志。精简记录在：

```bash
"$DSH_HOME/logs/liangxiang.log"
```

未设置 `DSH_HOME` 时是 `~/.dsh/logs/liangxiang.log`。文件最多 5MB，超出后丢掉最旧的行。
需要定位问题时把这个文件拿出来即可。

## Host 日志 `backend GET /bootstrap timed out`

进程在 VPS 上仍可能是 `active`，本机 `curl 127.0.0.1:<port>/v1/health` 也仍可能 200。这表示**外网到该端口被挡住了**（华为云安全组 / 防护），不是梁相又切回了本地。

核对：

1. 安全组只需公网放行 `80/tcp` 与 `443/tcp`；后端端口 `4180` 必须只监听回环地址。
2. 本机 `curl -m 5 https://api.liang.today/v1/health` 应在 1 秒内返回 `status":"ok"`。
3. 面板若写「今日梁案（本地）」，那是欢迎页选了本地，或旧占位帧；连不上时应是「今日梁案」+「无法连接天庭」。

## 梁位不动

- 零票时是 `--`，不是 0%（不伪造 50/50）。
- 已发布快照按 cadence 更新，但**被接受的投票会在自己的事务里发布快照**，所以你自己的票应当立刻可见。若不可见：看后端日志里那次 `POST /v1/votes` 的 status，409 说明是业务拒绝（香火不足/幂等冲突/旧梁案）。

## 后端拒绝启动

```
configuration rejected: VERIFIED_PRODUCTION is blocked: Decision Gate A = A3 …
```

这是设计好的门禁，不是 bug（见 [`075`](075-backend-decision.md)）。用 `LIANGXIANG_AUTHORITY_MODE=DEV_STAGING_ONLY`（默认值）。

## `fetch failed: bad port`

Node 的 fetch（undici）会拒绝 WHATWG「bad port」名单上的端口（4045、**4190**、5060、6000、6666…）。换一个端口，默认 4180 不在名单内。

## `ExperimentalWarning: SQLite is an experimental feature`

`node:sqlite` 在 Node 22 仍是实验特性，只是警告。用 Node 24 或 `--no-warnings=ExperimentalWarning` 可消除。

## 徽章不见了 / 拖到看不见的地方

位置存在浏览器 `localStorage`，读取时会按当前窗口尺寸夹回可视区。真丢了就清掉这一项：

```js
localStorage.removeItem('liangxiang:badge-position:v2')
```
