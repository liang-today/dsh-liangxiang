# 100 — Release Readiness（v0.5.0 梁相）

结论：**社区 soft-trust 发布候选可部署**；不得宣传为实名、一人一票、
可信公投或服务器核验 Token。香港迁移与 `api.liang.today` TLS 切换是独立的
下一阶段门，不改变这条信任边界。

## 本版变更

- 对外品牌及技术主标识统一为 `liangxiang / 梁相`：包、Host、路由、存储域、
  环境变量、后端服务、目录、日志、样式标识和文档全部使用新名。
- v0.5 保留一次升级桥：旧身份、账本、浏览器偏好和 `LIANGBIAO_*` 环境变量
  可被读取；所有新写入只进入 `liangxiang` 命名空间。
- 社区口令不再有源码默认值，分发 bundle 不含密钥。
- 投票限流增加活跃 key 硬上限；预期拒绝、重放和 429 日志按原因采样。
- 首次后端改名部署使用 SQLite 在线一致性备份，并可在失败回滚后安全重试。

## 2026-08-18 自动化验证

| 门 | 结果 |
|---|---|
| `pnpm run typecheck` | ✅ |
| `pnpm run lint` | ✅ |
| `pnpm run test` | ✅ 33 文件 / 404 项 |
| `pnpm run build` | ✅ Host 126.63 kB；Backend 109.57 kB；Client 915.22 kB（gzip 599.51 kB） |
| `pnpm audit --prod` | ✅ 0 个已知漏洞 |
| `smoke:clean-profile` | ✅ 全新 profile 从 `dsh-liangxiang-0.5.0.tgz` 安装并启动 |
| `smoke:online` | ✅ Host→后端、Token claim、幂等、50 并发仅一票、快照发布 |
| 构建配置迁移 | ✅ 迁移前后三个 bundle SHA-256 相同，无弃用警告 |
| 密钥/旧包名扫描 | ✅ bundle 不含社区口令或 `dsh-liangbiao` |

## 发布验收

发行完成还必须逐项满足：

1. 当前提交已推送；社区服务器 `VERSION` 与该提交一致。
2. 旧 SQLite 票、身份与梁祠档案的数量和抽样内容在迁移前后一致。
3. Mac 与树莓派均已卸载旧包、安装新包，且安装身份未改变。
4. 桌面 `liangxiang` 目录中的 tarball 通过内容、密钥和 SHA-256 审计。
5. 香港主机尚未给出时，不提前改 DNS；迁移时先旁路验收，再切
   `api.liang.today`，保留旧节点作为限时回滚点。

## 接受的限制

- DSH 当前没有服务器可验证的身份和 Token 权威，仍是社区软信任。
- DSH RC 依赖闭包存在 rc.6/rc.7 漂移告警，但干净安装与运行时冒烟通过；
  详见 [`BUGFIX`](BUGFIX.md) BF-012。
- 客户端六态美术内联，单文件体积较大。
- 视觉回归、axe、真实多会话长跑和跨进程 SQLite 压测仍待补；详见
  [`102`](102-known-limitations.md)。
