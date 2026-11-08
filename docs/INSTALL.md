# 安装、升级与运行

推荐使用 [DSH 官方 Desktop](https://www.deepseek.com/zh/harness/) 的内置插件安装入口。
安装后页面边缘出现“今日梁相”；单击打开今日梁案，可拖动入口调整位置。
本文对应 **dsh-liangxiang@2.0.0**。安装后在梁相案牍核对版本。

## Desktop：应用内安装

### 1. 打开「添加插件」

左侧点 **插件**，再点右上角 **添加插件**。

![在 DSH Desktop 的插件页面打开添加插件](assets/install/desktop-add-plugin.jpg)

### 2. 输入完整包名并安装

输入 **`dsh-liangxiang`**，点击 **安装**。输入或搜索时都必须使用完整包名。

![输入完整包名 dsh-liangxiang 并点击安装](assets/install/desktop-package-name.jpg)

### 3. 立即启用

安装完成后点 **立即启用**；页面边缘出现“今日梁相”即完成。若提示需要刷新或重启，按提示操作。

![安装完成后点击立即启用](assets/install/desktop-enable-plugin.jpg)

*安装后可在「梁相案牍 → 当前版本」核对版本。*

以上流程无需命令行、额外市场插件或索引配置。已有“发现”或社区市场入口时，同样搜索完整包名 `dsh-liangxiang`。

### 更新已安装的梁相

- **支持原生更新的DSH版本（如0.2.2-rc.1）**：打开已安装的梁相详情，优先在 **版本** 区按应用提示更新。该入口适用于从npm注册表安装、且被宿主标为可更新的第三方插件；从本地路径、Git或压缩包安装的插件不提供此版本区。完成后如应用要求则重启，再到 **梁相案牍 → 当前版本** 核对版本与更新说明。见[当前DSH更新说明](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-plugin-manager/README.zh.md#更新注册表组合包)。
- **0.2.1-rc.2等旧入口，或没有更新入口时**：在 **插件 → 已安装 → 梁相** 卸载插件，再按上面的步骤安装新版。旧流程见[对应版本说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.md)。

更新失败时，先查看应用报告的原版本保留／恢复结果及后续提示；不能假定失败后一定已恢复。恢复也失败、显示未安装时，再重新安装梁相。恢复规则见[DSH宿主说明](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/plugin-manager/README.zh.md#use-this-package)。
更新或卸载梁相都不要求清除DSH数据目录；保留原身份、香火账本与梁祠记录。

### 从1.2升级到2.0

保留原DSH数据目录，按上面适合当前DSH版本的方式更新梁相；不要清个人Profile，也不要重置身份。
2.0首次启用在线钱包，仅承接启用当天的实际余香和不足一炷进度，不补发历史已过期香火。
启用后，香火余额与已到账收益跨日保留，可用与冻结分开记账。

**同一身份启用2.0钱包后，请继续使用2.0及以上版本。** 旧客户端无法操作已启用的钱包；
未修改的1.2界面可能只显示HTTP412，不能依靠后台更新让它自动显示新的升级说明。
暂不升级、从未启用钱包的1.2用户仍可使用原日账玩法；离线账本不进入在线钱包或梁股。
完整边界见[旧版兼容说明](LEGACY_WALLET_COMPAT.md)。

### 装完仍显示旧版本

先区分“已经安装”与“已经升级”：支持原生更新的DSH，可在梁相详情的版本区重新检查并按提示更新，
查看是否需要重启。官方0.2.1-rc.2旧入口不会因为重新搜索、点击安装或重启应用而自动替换旧包；
应先在已安装列表卸载**梁相插件**，再添加目标版本并启用。
无需卸载 DeepSeek 客户端，也不要删除其数据目录。

新版本发布后未满 24 小时，pnpm 11 的默认等待期还可能让不带版本号的包名或 `@latest`
安装到较旧版本。需要立即安装已确认发布的版本时，在“添加插件”输入精确版本；例如
安装2.0时可填写 **`dsh-liangxiang@2.0.0`**，完成后核对实际版本。
精确版本在 pnpm 默认策略下可被明确选择；若安装器提示等待期或策略确认，按应用提示处理，
不修改全局安全配置。安装后核对已安装列表和梁相案牍中的版本；它们都应变成目标版本。

`latest` 是更新目标，不能使正在运行的旧包立即升级。梁相启动时的版本浮动只调整自身
依赖规则，不会自行运行安装器或替换运行中的依赖。原理与复现见
[`INSTALL_VERSION_DIAGNOSIS.md`](INSTALL_VERSION_DIAGNOSIS.md)。

Desktop 的 `desktop` Profile 由桌面应用独占管理。普通 npm CLI 的 `web` 命令不能用于它；
不再使用手动改 Desktop 家目录或混用桌面 pnpm 的旧安装方法。

## Cmd：命令行 WebUI

当前默认DSH0.2.2要求Node24.9及以上；Desktop使用内置运行环境，无需另装Node。源码开发的固定0.2.1-rc.2基线仍见[兼容证据](COMPATIBILITY.md)。

按 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness#run) 准备运行环境。
退出对应 WebUI 后，安装并启动：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已有全局 `dsh` 时可替换命令开头。安装和启动必须使用同一个 Profile；自定义 Profile
把 `web` 换成实际名称，并在启动命令中使用 `--profile`。该选项应写在 `add` / `remove` 之前。
不要运行 `npm i dsh-liangxiang`，它只安装普通依赖，不注册 DSH 插件。

更新到当前公开正式版：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang@latest
npx --yes @deepseek-ai/dsh web
```

卸载：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web remove dsh-liangxiang
```

安装、更新和卸载插件均保留本机香火与梁祠记录。
不要为了安装梁相再装旧 `dshmarket`；已使用社区市场的用户可按其兼容说明继续操作。

### 本地发行包

从 [GitHub Releases](https://github.com/liang-today/dsh-liangxiang/releases) 下载正式包后，
在文件所在目录执行；以下以2.0.0包为例，版本号应与实际下载文件一致。
本地相对路径必须带 `./`，避免被当成 npm 包名：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add ./dsh-liangxiang-2.0.0.tgz
```

## 在线连接与代理

在线模式无法连接时，可启用代理软件的 TUN 模式，或在 DSH 主目录的 `$DSH_HOME/.env` 中设置 HTTP 代理，然后完全退出并重启 DSH。将下面的 `7890` 换成自己的 HTTP 代理端口：

```dotenv
HTTPS_PROXY="http://127.0.0.1:7890"
HTTP_PROXY="http://127.0.0.1:7890"
```

这里不要填写 SOCKS URL；配置放在 DSH 主目录，而不是项目 `.env`。
见 [DSH 官方代理说明](https://deepseek-harness.github.io/deepseek-harness/guide/network-proxy)。
梁相保持在线偏好并自动重连；需要本机自玩时，可在案牍手动选择离线模式，两边账本不合并。

## 开发与自建 Backend

源码开发使用隔离 Profile，不修改日常 DSH 或 Desktop：

```bash
pnpm install
pnpm run dev:install
pnpm run dev:web
```

默认开发入口为本机 3080。脚本使用隔离 `DSH_HOME`；需要离线首次默认时设置
`LIANGXIANG_BACKEND_URL=local`。已有保存偏好不会被环境变量覆盖。
开发卸载使用 `pnpm run dev:uninstall`。精确兼容环境见 [`COMPATIBILITY.md`](COMPATIBILITY.md)；干净安装门禁采用 pnpm 11.28.5，日常开发不强制改动已工作的工具链。

验证最终安装包：

```bash
pnpm run verify
pnpm run smoke:browser-clean-profile
pnpm run smoke:online
```

自动门禁只使用临时 Profile、SQLite 和 localhost。不要降低日常依赖安装政策或忽略兼容检查。
Profile 中的内置 DSH bundle 由运行时提供，不把官方 Web App 闭包重复装入其 node_modules；
可用 `node scripts/assert-profile-modules.mjs <profile-directory>` 只读核对。

普通插件包不包含 Backend，也不要求用户自建服务器。自建节点从仓库运行后端，部署、备份、
迁移和版本检查统一走 [`121-vps-deploy.md`](121-vps-deploy.md) 与仓库部署脚本。
全部可选配置见 [`.env.example`](../.env.example)，排障见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)。
