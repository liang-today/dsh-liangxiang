# PR #30与钱包候选集成

## 来源与保留范围

社区[PR #30](https://github.com/liang-today/dsh-liangxiang/pull/30)的原提交为
`123ce94`，已在必需CI通过及评审后，以 `5f1465d` 合入main，保留原作者提交。
本分支将该main作为合并父节点，保留 `1.3.0-alpha.12`、对应服务构建号、
累计钱包、三盘交易、现有市场界面与全部动效。未发布、未部署或替换既有手测安装。

8处冲突均为版本或说明：`package.json`、`src/shared/index.ts`、
`src/client/release-notes.ts`、`CHANGELOG.md`、`README.md`、`SECURITY.md`、
`docs/COMPATIBILITY.md`、`docs/CURRENT_ARCHITECTURE.md`。
保留1.3候选版本与四条现行更新说明，完整保留上游修复的历史记录，
说明同步到当前市场行为；Backend、SQLite schema、冻结及派彩实现没有冲突或改动。

## 修复与漏测原因

- PR将上香请求号改为兼容生成器，并将同步抛错纳入原有失败反馈和解锁链。
- 钱包分支另有一处 `browserMarketTransport` 直接调用 `crypto.randomUUID`，
  本次同样复用新生成器。已有市场异步提交与 `finally` 解锁保持原样。
- 既有浏览器检查主要走localhost，浏览器将其视为安全上下文；市场单测还注入了固定
  测试请求号，未走默认浏览器生成器。因而此前成功不能证明局域网HTTP兼容。
- 非安全上下文、异常Web Crypto及无Web Crypto已有独立回归；真实SQLite验证首次
  冻结10炷后回执丢失、关闭重开、原ID和原JSON请求体重试，钱包版本与冻结均不重复增加；
  下一个新意图使用新ID，冻结正确调整为15炷。将生成器在内存恢复旧实现时4项全部失败，
  正常实现4项全部通过。

## 验证记录

PR本身的本地检查为67文件761项，三平台、隐私、实包安装／浏览器及隔离在线CI全部通过。
合并后的源码检查为92文件993项，类型、lint、构建与体积通过；客户端raw723719字节、
gzip423753字节（最终Node22.19检查），未放宽预算。

独立3983临时Profile完成最终tarball安装，真实HTTP浏览器6项全部通过（43.4秒）：
桌面、窄屏、暗色均断言原生 `isSecureContext=false`、`randomUUID` 缺失、
`getRandomValues` 可用，并验证连续夯／拉请求号不同、按钮锁释放及市场5炷做多提交。
未删除或替换浏览器Crypto API，也未使用安全豁免。该浏览器用例的权威响应为测试Mock，
只证明实包客户端兼容；真实SQLite事务、冻结及重放在上述独立4项回归中验证，
不能将其写成真实云端结算或可验证Token记账。临时服务与Profile已清理。

运行中的3999使用独立安装包，不随源文件变化自动替换；其进程、启动时间与4个安装文件
SHA前后完全一致，两个香港既有测试服务也保持原进程和启动时间。
验证使用额外的临时本机DSH与隔离数据，不更新3999、不操作用户仓位。

## 将社区PR检出到独立本地目录

在已配置个人fork为origin、社区仓为upstream的clone内执行。先确认分支和目录尚不存在，
不要在正用于开发或手测的工作目录里切走分支：

```bash
git fetch upstream refs/pull/30/head:refs/remotes/upstream/pr-30
git worktree add -b codex/review-pr30 ../liangxiang-pr30-review upstream/pr-30
```

这只检出代码；GitHub Checks仍是远端CI结果，本地须独立运行 `pnpm run verify`，
再按变更运行隔离安装、浏览器和在线检查。未经合并的PR先这样检视；合并后要同步完整main，
不要只复制文件或只取补丁而丢掉来源历史。
