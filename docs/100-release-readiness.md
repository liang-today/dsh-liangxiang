# 100 — Release Readiness（v0.8.5-beta 梁相）

结论：**社区 soft-trust 发布候选可部署**；不得宣传为实名、一人一票、
可信公投或服务器核验 Token。香港节点的数据与服务迁移已经完成，
`hk-api.liang.today` 旁路与 `api.liang.today` 正式域名验收均已通过；这不改变
社区模式的信任边界。详见 [`142`](142-hk-migration-report.md)。

## 本版变更

- 对外品牌及技术主标识统一为 `liangxiang / 梁相`：包、Host、路由、存储域、
  环境变量、后端服务、目录、日志、样式标识和文档全部使用新名。
- 品牌过渡桥已结束：代码、配置、身份、账本、浏览器偏好与部署仅使用
  `liangxiang / LIANGXIANG_*` 命名空间。
- 首次安装自动领取并认领短期入梁券；旧共享口令通道已删除，分发 bundle 不含准入凭据。
- 服务器统一命令可查询、发行、作废入梁券；生产已备足 1,000 次可用认领库存。
- 投票限流增加活跃 key 硬上限；预期拒绝、重放和 429 日志按原因采样。
- 香港迁移使用 SQLite 在线一致性备份；部署只有在 health/history 冒烟通过后才写入版本戳。
- 断网不再暗切本地玩法：Token 水位继续本地持久化，社区投票锁定，Host 与浏览器均自动重连。
- 离线模式由用户手动选择并持久化；离线香火、打梁、梁案和梁祠使用独立 `liangxiang_local.json`，与社区账本不混用。
- 梁祠月历按月份实际使用 4/5/6 周，在固定高度内完整显示且只保留窄屏横向滚动。
- 香港节点统一 `liang` 运维命令可查询未来排期并原子替换整张未发布题表；客户端提供保留用户存储的一键更新脚本。

## 2026-08-18 自动化验证

| 门 | 结果 |
|---|---|
| `pnpm run typecheck` | ✅ |
| `pnpm run lint` | ✅ |
| `pnpm run test` | ✅ 36 文件 / 452 项 |
| `pnpm run build` | ✅ Host 154.63 kB（gzip 38.63 kB）；Backend 131.09 kB；Client 940.35 kB（gzip 604.67 kB） |
| `pnpm audit --prod` | ✅ 0 个已知漏洞 |
| `smoke:clean-profile` | ✅ 全新 profile 从候选 tarball 安装；默认在线显式切离线成功，后端不可达时重启仍保持离线，独立本地存档存在 |
| `smoke:online` | ✅ Host→后端、Token claim、幂等、50 并发仅一票、快照发布（SQLite 事务层；正式签名链另有 Host 集成测试与公网回归） |
| 构建配置迁移 | ✅ 迁移前后三个 bundle SHA-256 相同，无弃用警告 |
| 密钥/命名空间扫描 | ✅ bundle 不含入梁券 secret 或共享准入凭据，仓库只使用 `liangxiang / 梁相` |
| 香港节点旁路验收 | ✅ TLS、鉴权、快照、梁祠、数据库、端口与服务沙箱 |
| MacBook / Mac mini 安装 | ⚠️ 0.8.5-beta 候选包已放到桌面 `liangxiang` 目录供真实 profile 手工验收；MacBook 日常 profile 与 Mac mini 仍待装完后勾掉 |
| `api.liang.today` 权威解析与 TLS | ✅ 权威及公共解析器收敛，正式 Let's Encrypt 证书生效 |
| npm 公开包复核 | ✅ `0.8.5-beta` 已发布；`latest` 与 `beta` 均指向该版本；历史 `0.8.0` 仍不可覆盖 |
| 0.8.5-beta 候选包 | ✅ 7 文件；SHA-256 `4aa71e3fa1882fb4a11127c7877e2061ed61f15b1df2db0d1e38759cd5cebc32`；无个人路径、内网/旧服务器 IP、私钥、旧共享口令或密钥形文件 |
| 香港公网峰值（只读） | ✅ `/v1/health` 1,000 请求 / 1,000 并发新建 TLS 连接，0 失败；测试后 Caddy/Backend 无 warning、内存余量 14 GiB |

npm 首次创建包时在显式 `beta` 之外仍自动建立了 `latest=0.8.0`，且 registry
拒绝删除首版 `latest` 标签。`0.8.0` 不可覆盖。本版将 `0.8.5-beta` 发到 `beta`
标签，并视需要把 `latest` 也指过来，安装文档仍写 `@beta`。不得把 registry
默认标签解释为已核验的稳定公投。

## 发布验收

发行完成还必须逐项满足：

1. 当前提交已推送；社区服务器 `VERSION` 与该提交一致。
2. 旧 SQLite 票、身份与梁祠档案的数量和抽样内容在迁移前后一致。
3. 本机 MacBook 与独立 Mac mini 均已安装新包；更新路径保留身份，全新安装按设计领取入梁券。
4. 桌面 `liangxiang` 目录中的 tarball 已按内容、密钥和 SHA-256 审计通过
   （`dsh-liangxiang-0.8.5-beta.tgz` /
   `4aa71e3fa1882fb4a11127c7877e2061ed61f15b1df2db0d1e38759cd5cebc32`）。
   真实 MacBook / Mac mini profile 安装仍待运营者手工勾掉。
5. 香港节点先经 `hk-api.liang.today` 旁路验收，再切 `api.liang.today`；
   原节点作为只读限时回滚点，不得与新节点同时接收写入。

## 接受的限制

- DSH 当前没有服务器可验证的身份和 Token 权威，仍是社区软信任。
- DSH 开发依赖已钉 `0.1.0-rc.7`；干净安装仍可能看到 DSH 闭包自身的 peer warning，
  详见 [`BUGFIX`](BUGFIX.md) BF-012。
- 客户端六态美术内联，单文件体积较大。
- 视觉回归、axe、真实多会话长跑和跨进程 SQLite 压测仍待补；详见
  [`102`](102-known-limitations.md)。
