# 100 — Release Readiness（v0.8.0 梁相）

结论：**社区 soft-trust 发布候选可部署**；不得宣传为实名、一人一票、
可信公投或服务器核验 Token。香港节点的数据与服务迁移已经完成，
`hk-api.liang.today` 旁路与 `api.liang.today` 正式域名验收均已通过；这不改变
社区模式的信任边界。详见 [`142`](142-hk-migration-report.md)。

## 本版变更

- 对外品牌及技术主标识统一为 `liangxiang / 梁相`：包、Host、路由、存储域、
  环境变量、后端服务、目录、日志、样式标识和文档全部使用新名。
- 品牌过渡桥已结束：代码、配置、身份、账本、浏览器偏好与部署仅使用
  `liangxiang / LIANGXIANG_*` 命名空间。
- 首次安装自动领取并认领短期入梁券；生产社区口令已关闭，分发 bundle 不含密钥。
- 服务器统一命令可查询、发行、作废入梁券；生产已备足 1,000 次可用认领库存。
- 投票限流增加活跃 key 硬上限；预期拒绝、重放和 429 日志按原因采样。
- 香港迁移使用 SQLite 在线一致性备份；部署只有在 health/history 冒烟通过后才写入版本戳。
- 断网不再暗切本地玩法：Token 水位继续本地持久化，社区投票锁定，Host 与浏览器均自动重连。
- 梁祠月历按月份实际使用 4/5/6 周，在固定高度内完整显示且只保留窄屏横向滚动。
- 香港节点统一 `liang` 运维命令可查询未来排期并原子替换整张未发布题表；客户端提供保留用户存储的一键更新脚本。

## 2026-08-18 自动化验证

| 门 | 结果 |
|---|---|
| `pnpm run typecheck` | ✅ |
| `pnpm run lint` | ✅ |
| `pnpm run test` | ✅ 35 文件 / 423 项 |
| `pnpm run build` | ✅ Host 132.55 kB；Backend 131.48 kB；Client 933.13 kB（gzip 603.16 kB） |
| `pnpm audit --prod` | ✅ 0 个已知漏洞 |
| `smoke:clean-profile` | ✅ 全新 profile 从 `dsh-liangxiang-0.8.0.tgz` 安装并启动 |
| `smoke:online` | ✅ Host→后端、Token claim、幂等、50 并发仅一票、快照发布 |
| 构建配置迁移 | ✅ 迁移前后三个 bundle SHA-256 相同，无弃用警告 |
| 密钥/命名空间扫描 | ✅ bundle 不含社区口令，仓库只使用 `liangxiang / 梁相` |
| 香港节点旁路验收 | ✅ TLS、鉴权、快照、梁祠、数据库、端口与服务沙箱 |
| MacBook / Mac mini 安装 | ✅ 0.8.0；更新路径保留存储，全新安装经正式入梁券登记，在线 authority 恢复 |
| `api.liang.today` 权威解析与 TLS | ✅ 权威及公共解析器收敛，正式 Let's Encrypt 证书生效 |
| npm 公开包复核 | ✅ `dsh-liangxiang@0.8.0`，7 文件，SHA-1 `df17b5988420e68eb1eb67c7b4fb56cad649fc0c`；registry 回下载隐私复扫通过 |

npm 首次创建包时在显式 `beta` 之外仍自动建立了 `latest=0.8.0`，且 registry
拒绝删除首版 `latest` 标签；发布口径与安装文档仍统一要求显式使用 `@beta`。
不得把这个 registry 默认标签解释为正式稳定版或 GitHub Release。

## 发布验收

发行完成还必须逐项满足：

1. 当前提交已推送；社区服务器 `VERSION` 与该提交一致。
2. 旧 SQLite 票、身份与梁祠档案的数量和抽样内容在迁移前后一致。
3. 本机 MacBook 与独立 Mac mini 均已安装新包；更新路径保留身份，全新安装按设计领取入梁券。
4. 桌面 `liangxiang` 目录中的 tarball 通过内容、密钥和 SHA-256 审计。
5. 香港节点先经 `hk-api.liang.today` 旁路验收，再切 `api.liang.today`；
   原节点作为只读限时回滚点，不得与新节点同时接收写入。

## 接受的限制

- DSH 当前没有服务器可验证的身份和 Token 权威，仍是社区软信任。
- DSH RC 依赖闭包存在 rc.6/rc.7 漂移告警，但干净安装与运行时冒烟通过；
  详见 [`BUGFIX`](BUGFIX.md) BF-012。
- 客户端六态美术内联，单文件体积较大。
- 视觉回归、axe、真实多会话长跑和跨进程 SQLite 压测仍待补；详见
  [`102`](102-known-limitations.md)。
