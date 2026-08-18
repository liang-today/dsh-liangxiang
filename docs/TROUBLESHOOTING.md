# TROUBLESHOOTING

## 更新脚本提示没有 `dsh` 命令

没有全局安装 DSH CLI。两种用法等价：

```bash
dsh plugin --profile web add ./dsh-liangxiang-0.8.3-beta.tgz
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-0.8.3-beta.tgz
```

`scripts/update-plugin.sh` 现在会在找不到 `dsh` 时自动改用 npx。也可以显式指定：`--dsh npx`。

## 本地 tarball 报 `ERR_PNPM_FETCH_404`

路径少了 `./`（或绝对路径），pnpm 把文件名当成 npm 包名去 registry 拉。必须写成：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-0.8.3-beta.tgz
```

不要写成 `… web add dsh-liangxiang-0.8.3-beta.tgz`：`web` 是启动 WebUI，安装插件的子命令是 `plugin add`。

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

## 面板显示「未连上梁相服务」

Host 通道不可用，或在线 bootstrap 超时。检查：

- WebUI 终端是否有 `[dsh-liangxiang] host half active` 以及 `DEV_STAGING_ONLY`；
- `curl http://127.0.0.1:<webui>/liangxiang/api/state` 是否 200；
- 在线模式：本机 `curl -m 5 https://api.liang.today/v1/health`（不要只 curl 服务器的 localhost）。

面板会保留最近一次状态继续渲染；重新打开面板会再试一次。

## 面板显示「记账不可用」

DSH 的 `sessionProjections` / `sessions` 没注入（组合里缺插件，或版本变更）。梁气会停在 0 炷；投票按钮因此禁用。查 `docs/003` 的对应行与 `compat/dsh/usage-observer.ts` 的告警。

## 香火一直是 0（在线模式）

大概率是**业务日不一致**：Host 用自己的时区给本地观测分桶，后端只接受 `claim_business_date == 服务器业务日` 的声明，不一致就忽略并告警（宁可少记不错记）。把两侧的 `LIANGXIANG_BUSINESS_TZ` 对齐后重启。

也可能是当天确实还没产生用量：`LIANGXIANG_TOKEN_PER_INCENSE=50000` 意味着要 5 万 Effective Token 才有第一炷；本地演示可以调小。

## 打梁报 502 / 「打梁失败」

Host 与后端之间的请求失败。**用同一个 `request_id` 重试是安全的**（幂等域是 `(installation_id, request_id)`，重放不会二次扣香）；换新 id 才会有二次扣香风险，客户端不会那样做。

## Host 日志 `backend GET /bootstrap timed out`

进程在 VPS 上仍可能是 `active`，本机 `curl 127.0.0.1:<port>/v1/health` 也仍可能 200。这表示**外网到该端口被挡住了**（华为云安全组 / 防护），不是梁相又切回了本地。

核对：

1. 安全组只需公网放行 `80/tcp` 与 `443/tcp`；后端端口 `4180` 必须只监听回环地址。
2. 本机 `curl -m 5 https://api.liang.today/v1/health` 应在 1 秒内返回 `status":"ok"`。
3. 面板若写「今日梁案（本地）」，那是欢迎页选了本地，或旧占位帧；连不上时应是「今日梁案」+「未连上梁相服务」。

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
localStorage.removeItem('liangxiang:badge-position:v1')
```
