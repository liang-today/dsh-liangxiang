# 官方安装入口仍显示旧版本

核查日期：2026-10-20。本文区分发布状态、版本解析、实际安装和运行中的客户端，
不把市场列表上的“已安装”当作“已经更新到最新版”。

## 已确认的发布状态

- npm 注册表 `dist-tags.latest` 为 `1.2.0`，发布时间为 2026-10-19 11:56:56 UTC。
- GitHub 最新正式 Release 为 `v1.2.0`，发布时间为 2026-10-19 12:00:32 UTC，非草稿、非预发布。
- npm 包的完整性与注册表 SHA-512 一致；GitHub 附件与 npm 包字节一致。
  包清单为 `1.2.0`，客户端构建内的版本值也是 `1.2.0`。
- 核查时 npm 官方源及 npmmirror 的版本元数据均为 `1.2.0`。不能据此推断每个设备
  的旧缓存、锁文件和实装包已经更新。

核查来源：[npm 元数据](https://registry.npmjs.org/dsh-liangxiang)、
[GitHub Release](https://github.com/liang-today/dsh-liangxiang/releases/tag/v1.2.0)。
这些是该日期的公开状态，后续发布需重新查询。

## 两种独立原因

### 旧插件没有完成替换

DSH 0.2.1-rc.2 的官方插件入口中，社区插件不支持直接覆盖安装。界面会拒绝已经存在的
包；启用 HMR 的 Host 也会在运行安装器之前返回 `already-installed`。需要先卸载该插件，
再安装并启用目标版本。官方随附插件的“更新”按钮不能代表所有社区插件都支持同样的行为。

旧包没有替换时，已安装列表与梁相案牍都会继续显示旧版本。重新搜索、刷新、重启或
把依赖目标改成 `latest`，都不等于已经安装新包。

证据：固定基线 `687f282e86` 的
[`plugin-install-over-installed` 官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.zh.md)，
以及 `packages/boot/plugin-manager/src/index.ts` 的 `inspectSpec` / `installBundle` 与
`packages/client/ui-plugin-manager/src/client/manager-store.ts` 的 `runInstall`。

### 新版本尚在安装器等待期

pnpm 11 默认等待新版本发布满 1440 分钟。刚发布的版本可能被跳过，裸包名或 `@latest`
仍可能解析到较旧版本。已有 `minimumReleaseAgeExclude` 排除规则的 Profile 则可能直接
选中新版，造成相同客户端版本在不同设备上结果不同。

在发布尚未满 24 小时的核查时点，以 pnpm 11.28.5、同一 npm 官方源、不同的全新临时目录，
使用 `add --lockfile-only --ignore-scripts` 进行了真实版本解析：

| 输入与配置 | 解析结果 |
|---|---|
| `dsh-liangxiang@latest`，默认配置 | `1.1.6` |
| `dsh-liangxiang@latest`，仅排除梁相的等待期 | `1.2.0` |
| `dsh-liangxiang@1.2.0`，默认非 strict 配置 | `1.2.0`，pnpm 为该明确选择增加版本排除项 |

这证明了等待期机制会造成差异，不证明某一具体设备一定触发了它；设备结论需结合
其 Profile 配置、锁文件和安装日志。若显式配置了 strict 等待策略，应按安装器提示
确认或等待，不能把默认配置下的解析结果视为对所有环境的保证。

规则来源：[pnpm 等待期与排除项](https://pnpm.io/settings/dependency-resolution#minimumreleaseage)、
[strict 默认行为](https://pnpm.io/settings/dependency-resolution#minimumreleaseagestrict)。

## 最小处理方式

1. 在 Desktop 的已安装列表卸载**梁相插件**，保留客户端及数据目录。
2. 在“添加插件”填写经过发布核对的精确版本，例如 `dsh-liangxiang@1.2.0`，安装并立即启用。
3. 按应用提示刷新或重启，核对已安装列表和梁相案牍，两处都应显示目标版本。

梁相的启动浮动逻辑只维护自身更新目标，不会运行安装器或改写运行中的依赖。
不能用后台自动重装来掩盖升级问题。无需重新发布同一个版本、清空账本或关闭全局安全检查。
完整操作见 [`INSTALL.md`](INSTALL.md#装完仍显示旧版本)。
