# 144 — 断连恢复、本地玩法与客户端更新

## 三种状态必须分开

| 状态 | Token / 香火 | 夯 / 拉 | 恢复方式 |
|---|---|---|---|
| 在线社区正常 | 本机观察并向社区核对 | 可用（以服务端余额为准） | 无需动作 |
| 网络或社区后端断开 | 本机继续观察并持久化；界面显示本地凝香进度 | 禁用，避免离线双花 | 自动退避重连，成功后自动上报累计增量并核对余额 |
| 用户明确选择本地玩法 | 只在本机累计、打梁、归档 | 可用，但只改变本机结果 | 一直保持本地，除非用户主动切回/重启为在线配置 |

断网不是模式选择。代码不得因为健康检查失败、URL 写错、请求超时或服务重启而进入
`LOCAL_FAKE_DEV`。本地玩法只来自首启选择或明确的 `LIANGXIANG_BACKEND_URL=local`。

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

## 一键更新

发行目录附带 `scripts/update-plugin.sh`：

```bash
export DSH_HOME=/实际使用的/dsh/home
bash scripts/update-plugin.sh ./dsh-liangxiang-0.6.1.tgz --profile <profile名>
```

脚本先备份 `storages/liangxiang.json`，再用 DSH 的 `plugin add` 原位更新同名 bundle，
最后核对插件层和存储摘要。它不执行 `plugin remove`，因为移除 bundle 对升级没有必要，
也不删除 storage domain、安装密钥、历史水位或浏览器 localStorage。

DSH 的启动方式可能是终端、launchd、systemd 或容器，通用更新脚本不会猜测并强杀进程；
安装完成后需按原方式重启 WebUI，并刷新浏览器一次。正式分发包应把 tarball、更新脚本、
SHA-256 和简短安装说明放在同一目录。
