# 144 — 断连恢复、本地玩法与客户端更新

## 三种状态必须分开

| 状态 | Token / 香火 | 夯 / 拉 | 恢复方式 |
|---|---|---|---|
| 在线社区正常 | 本机观察并向社区核对 | 可用（以服务端余额为准） | 无需动作 |
| 网络或社区后端断开 | 本机继续观察并持久化；界面显示本地凝香进度 | 禁用，避免离线双花 | 自动退避重连，成功后自动上报累计增量并核对余额 |
| 用户明确选择离线玩法 | 只在独立本机账本累计、打梁、归档 | 可用，但只改变本机结果 | 一直保持离线，直到用户从梁相案牍主动切回在线 |

断网不是模式选择。代码不得因为健康检查失败、URL 写错、请求超时或服务重启而进入
`LOCAL_FAKE_DEV`。离线玩法只来自首启选择、梁相案牍的模式按钮，或尚无保存偏好时明确的 `LIANGXIANG_BACKEND_URL=local`。

选择会写入 `liangxiang.json`，DSH 重启不会自行改回。离线玩法第一次启用时按需创建
`liangxiang_local.json`，独立保存离线凝香、打梁、梁案序号与梁祠。切回在线必须先成功
连接社区；失败时保持离线，两个账本都不改。

## 启动是否等待天庭

DSH 主进程和 WebUI 不再等待社区 bootstrap。Host 在存储打开后立刻提供「连接中」状态；
首次探测 3 秒超时后告警并保持在线模式。后台按退避继续重连。只有用户从案牍主动切回
在线时，才必须先连上。

## 是否需要刷新页面

- 短时断网、社区服务重启：不需要。Host 每秒重试社区快照；浏览器与 Host 的 SSE
  断开后按 1、2、4…最多 30 秒自动重连。
- DSH 同版本重启：通常不需要。留在原页面会自动连回新 Host epoch；若浏览器已休眠或
  页面被系统冻结，重新打开页面即可。
- DSH 或梁相插件升级：重启 DSH 后刷新浏览器一次。原因不是账本恢复，而是让页面加载
  新版本前端 bundle；身份与香火数据在独立 storage domain 中，不靠页面保存。

重连期间保留最近一次全局快照，不伪造新梁位。Token 水位写入
`$DSH_HOME/storages/liangxiang.json`，恢复后发送的是同一业务日的单调 claim；夯 / 拉直到
社区 authority 再次成功响应才解锁。

## 用户怎么升级

先退出 WebUI，再执行对应路径的**同一条安装命令**，然后重启并刷新浏览器。账本不会被删除。

| 来源 | 升级命令 |
|---|---|
| npm | 先 `remove dsh-liangxiang`，再 `add dsh-liangxiang@beta`（本地 tarball 钉住时只 add 不会换源）。没有全局 `dsh` 时把开头换成 `npx --yes @deepseek-ai/dsh` |
| GitHub Release / tarball | 先 `cd` 到包目录，再 `add ./dsh-liangxiang-<version>.tgz` |
| 源码 | `git pull && pnpm install && pnpm run dev:install` |

没有全局 `dsh` 时，把命令开头的 `dsh` 整段换成 `npx --yes @deepseek-ai/dsh`。漏掉本地包前面的 `./`，或只写文件名，pnpm 会去请求 `registry.npmjs.org/dsh-liangxiang-<version>.tgz`，报 `ERR_PNPM_FETCH_404`。走 npm 请写 `dsh-liangxiang@beta`；本地包必须带 `./`。

卸载一律：`dsh plugin --profile web remove dsh-liangxiang`（源码开发 profile 用 `pnpm run dev:uninstall`）。

同版本号重打包时用下面的 `update-plugin.sh`，避免 DSH 报 Already up to date。

## 一键更新

发行目录附带 `scripts/update-plugin.sh`：

```bash
export DSH_HOME=/实际使用的/dsh/home
bash scripts/update-plugin.sh ./dsh-liangxiang-0.8.8-beta.tgz --profile <profile名>
```

脚本先备份并校验 `storages/liangxiang.json` 与存在时的 `storages/liangxiang_local.json`，再按 tarball 内容 SHA-256 复制到持久化包缓存，并用这个
内容寻址路径执行 DSH 的 `plugin add`。这样即使测试包仍是同一个版本号，内容变化也不会
被 DSH 的“Already up to date”短路。脚本最后核对分发包版本、已安装模块图和存储摘要。它不执行 `plugin remove`，因为移除 bundle 对升级没有必要，
也不删除 storage domain、安装密钥、历史水位或浏览器 localStorage。

DSH 的启动方式可能是终端、launchd、systemd 或容器，通用更新脚本不会猜测并强杀进程；
安装完成后需按原方式重启 WebUI，并刷新浏览器一次。正式分发包应把 tarball、更新脚本、
SHA-256 和简短安装说明放在同一目录。
