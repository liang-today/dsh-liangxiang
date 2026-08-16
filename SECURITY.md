# Security Policy

## 先看清适用范围

梁标 v0.1 是 **本地/预发（`DEV_STAGING_ONLY`）** 软件：后端默认只监听 `127.0.0.1`，没有 TLS、鉴权、配额，也**没有可验证身份或可验证 Token 用量**（Decision Gate A = A3，见 [`docs/075-backend-decision.md`](docs/075-backend-decision.md)）。

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

**报告里不要包含**真实 prompt、源码、密钥或个人数据——按上面的口径，梁标不需要它们就能复现。

## 处理承诺

这是一个玩笑项目，但记账部分是认真的：影响上述性质的问题会优先修，并在 `CHANGELOG.md` 说明。修复会附带一条回归测试——本仓所有安全类修复都遵循这个规矩。
