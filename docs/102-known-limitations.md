# 102 — Known Limitations（更新至 v0.7.0）

按严重度排列。**没有未修的 Blocker/High**；以下都是明确接受的限制，不违反冻结不变量。

## 结构性（A3，无法在本仓修好）

1. **没有可验证身份**。`installation_id` 是梁相自铸的假名 uuid，可删可造。`unique_voters` 的真实含义是「参与过的独立安装数」，不是人数。
2. **Token 用量不可验证**。`claimed_effective_tokens` 是 Host 观测的声明；后端只保证单调不回退，不保证为真。
3. 因此 **不能反女巫**，也不能声称 verified/secure usage voting。见 [`075`](075-backend-decision.md)、[`101`](101-threat-model.md)。

## 部署与运维

4. **社区服务仍是软信任**。代码默认监听 `127.0.0.1`，公网仅由 Caddy 在 `https://api.liang.today` 提供 TLS；Ed25519 安装签名与共享闭测口令不能证明真人身份或 Token 真实性。
5. **RC tarball 不含后端**。`lib/backend.js` 不在包内（插件包只装 Host + Client 两半）；在线模式需要从仓库运行 `pnpm run backend:start`。
6. **单机 SQLite 后端**。同机双进程共享 SQLite 已通过抢最后一炷与幂等重放测试；不支持跨机器共享数据库或多节点写入。
7. `node:sqlite` 在 Node 22 仍是实验特性，启动会打印 ExperimentalWarning。

## 数据与账务

8. **日切按业务日分区，但不预开次日梁案**：跨日后的第一个请求才创建当天梁案。
9. **Host 与后端时区标签可以不同**。Host 在线路径按后端 `business_date` 桶化观测并提交 claim；不再把今日用量写进另一个日期键后显示成 0。后端仍会忽略 *claim_business_date* 对不上的请求。
10. 梁祠只保存每个已结束业务日及已完成周/月的**终态档案**，不保存日内梁位曲线；秒级 `public_liang_snapshot` 仍只保留最新 200 条/梁案。没有梁案的日期显示「无存档」，不会伪造零票日。
11. Host 的本地日用量表按业务日累积、不清理（一年约 365 条，均为整数计数），可接受。
12. v0.7.0 沿用 SQLite v4 与 `/v1/history`；梁祠失败继续保留最后一次正确档案并显示「档案未更新」，不阻断今日投票。

## UI

13. 今日面板宽 256px 固定，匹配 DSH 默认 280px 侧栏的内容宽；梁祠已做窄屏横向日历滚动，但今日面板的折叠侧栏适配仍跟踪于 `docs/BUGFIX.md` BF-004。
14. 徽章位置存 `localStorage`，按浏览器 profile 记忆，不跨设备同步。
15. 梁位小数为 6 位固定，不随票数自适应；票数极少时（如 1/1）会显示 `50.000000%`，视觉上小数位显得多余但语义正确。
16. 六态美术是 256px PNG，**base64 内联**进客户端 bundle（DSH 客户端是单文件加载形态）；要做惰性加载需先验证 DSH 插件静态路由与缓存，跟踪于 `docs/BUGFIX.md` BF-007。

## 测试覆盖缺口

17. **跨机器并发未覆盖**（见第 6 条）；现有覆盖包括同进程 200 并发、同机双进程 100 并发和 HTTP 层。
18. **真实 DSH 多会话/replay/compaction 的长跑验证**未做；单会话与水位差分逻辑有单测与实机验证。
19. 浏览器兼容只在 Chromium（DSH WebUI 内置形态）验证过。
20. 无 a11y 自动化审计（axe 之类）；键盘、focus trap、Escape/焦点归还、reduced-motion、暗色主题为手工 + 单测断言。
