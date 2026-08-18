# Security Policy

## 先看清适用范围

梁相 v0.8.3-beta 是 **本地/社区预发（`DEV_STAGING_ONLY`）** 软件。默认后端只
监听 `127.0.0.1`；社区节点只通过 Caddy 在 `https://api.liang.today` 提供
HTTPS，并使用短期入梁券、Ed25519 安装签名、请求体上限、硬容量限流和
SQLite 事务保护。旧共享准入口令通道已经删除。以上控制都不等于可验证的
真人身份或可验证 Token 用量（Decision Gate A = A3，见
[`docs/075-backend-decision.md`](docs/075-backend-decision.md)）。

因此这两类问题**不是**漏洞，而是已记录的已知限制：

- 换一个 installation id 就能当「新用户」投票（无身份 ⇒ 无法反女巫）。
- 直接提交一个很大的 `claimed_effective_tokens` 就能拿到香火（Token 声明不可验证）。

它们写在 [`docs/101-threat-model.md`](docs/101-threat-model.md) 的 T11–T13 与 [`docs/102-known-limitations.md`](docs/102-known-limitations.md)。请不要为它们提交报告——它们的解除依赖 DSH 上游提供可验证身份/用量。

## 什么算漏洞

在**已声明的信任模型内**被破坏的性质，例如：

- 绕过原子扣香导致超支（并发或其他路径）；
- 绕过幂等造成同一 `request_id` 二次扣香/二次计票；
- 跨安装读取或篡改他人余额；
- SQL 注入、路径穿越、任意文件读写、RCE；
- prompt / 模型回复 / 源码 / 文件路径 / API key 出现在网络载荷或日志里；
- 使后端崩溃或无界占用内存/磁盘的请求；
- 客户端能让后端相信它自报的身份或票权。

## 如何报告

在仓库提交 issue 并加 `security` 标签，或直接联系维护者。请附：复现步骤、影响、版本（`package.json` 的 version + git commit）、运行模式（`LOCAL_FAKE_DEV` / `DEV_STAGING_ONLY`）。

**报告里不要包含**真实 prompt、源码、密钥、个人数据或源站主机地址——按上面的口径，梁相不需要它们就能复现。仓库、文档和讨论只写 `https://api.liang.today`；部署目标放在本机 `.env` 的 `LIANGXIANG_DEPLOY_SSH`，不要写进 git。

## 处理承诺

这是一个玩笑项目，但记账部分是认真的：影响上述性质的问题会优先修，并在 `CHANGELOG.md` 说明。修复会附带一条回归测试——本仓所有安全类修复都遵循这个规矩。
