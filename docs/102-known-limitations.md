# 102 — Known Limitations（v0.1 RC）

按严重度排列。**没有未修的 Blocker/High**；以下都是明确接受的限制，不违反冻结不变量。

## 结构性（A3，无法在本仓修好）

1. **没有可验证身份**。`installation_id` 是梁标自铸的假名 uuid，可删可造。`unique_voters` 的真实含义是「参与过的独立安装数」，不是人数。
2. **Token 用量不可验证**。`claimed_effective_tokens` 是 Host 观测的声明；后端只保证单调不回退，不保证为真。
3. 因此 **不能反女巫**，也不能声称 verified/secure usage voting。见 [`075`](075-backend-decision.md)、[`101`](101-threat-model.md)。

## 部署与运维

4. **仅 localhost**。后端默认监听 `127.0.0.1`，无 TLS、无鉴权、无配额；公网暴露未评估、不受支持。
5. **RC tarball 不含后端**。`lib/backend.js` 不在包内（插件包只装 Host + Client 两半）；在线模式需要从仓库运行 `pnpm run backend:start`。
6. **单进程后端**。多进程共享同一 SQLite 文件理论可行（WAL + busy_timeout + 单条 CAS），但未做压测，不建议作为结论依赖。
7. `node:sqlite` 在 Node 22 仍是实验特性，启动会打印 ExperimentalWarning。

## 数据与账务

8. **日切按业务日分区，但不预开次日梁案**：跨日后的第一个请求才创建当天梁案。
9. **Host 本地日期与后端业务日可能不一致**（不同时区配置）。此时 claim 会被后端忽略并告警，宁可少记不错记；表现为当日香火为 0，需把 `LIANGBIAO_BUSINESS_TZ` 对齐。
10. **无历史查询接口**。已发布快照只保留最新 200 条/梁案（1s cadence 下足够排查），没有「昨日梁位曲线」这类读接口。
11. Host 的本地日用量表按业务日累积、不清理（一年约 365 条，均为整数计数），可接受。

## UI

12. 面板宽 336px 固定，未做窄屏/移动端适配（DSH WebUI 本身是桌面形态）。
13. 徽章位置存 `localStorage`，按浏览器 profile 记忆，不跨设备同步。
14. 梁位小数为 6 位固定，不随票数自适应；票数极少时（如 1/1）会显示 `50.000000%`，视觉上小数位显得多余但语义正确。
15. 六态美术是 256px JPEG，**base64 内联**进客户端 bundle（DSH 客户端是单文件加载形态），产物因此从 56 kB 涨到约 279 kB / gzip 179 kB。本地加载可接受;要做惰性加载得新增静态路由。像素可替换，状态语义已冻结。

## 测试覆盖缺口

16. **跨进程并发未压测**（见第 6 条）；现有并发覆盖为同进程 200 并发 + HTTP 层。
17. **真实 DSH 多会话/replay/compaction 的长跑验证**未做；单会话与水位差分逻辑有单测与实机验证。
18. 浏览器兼容只在 Chromium（DSH WebUI 内置形态）验证过。
19. 无 a11y 自动化审计（axe 之类）；键盘、focus、Escape、reduced-motion、暗色主题为手工 + 单测断言。
