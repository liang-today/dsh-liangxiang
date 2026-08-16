# 052 — Local Observed vs Authoritative State

Decision Gate A = **A3**（docs/043）：本地一切 Token/身份数据都不是服务器可验证的权威。本文冻结两类状态在代码/文档/UI 中的边界，防止措辞漂移。

## 分类

| 状态 | 本质 | 命名/落点 | 允许用途 | 禁止用途 |
|---|---|---|---|---|
| 每会话 tokenUsage 投影 | DSH 本地折叠 | compat 观测层 | 喂给水位账本 | 直接当票权 |
| `daily_usage` / `watermarks` | **local observed** | `usage-ledger` + storage | 梁气进度、诊断、本地 earned 计算 | 声称 server-verifiable |
| earned/used/remaining | **本地 fake 权威**（`FakeAuthoritativeLiangService` 派生） | `LOCAL_FAKE_DEV` 模式 wire | 本地投票闭环、UX | 生产可信投票 |
| 全局 up/down/unique/快照 | 本地 fake 聚合 | 同上 | 本地演示全网风向 | 声称真实全网结果 |
| 匿名安装 id | 假名标识（本阶段未使用） | — | 未来去重参考 | 冒充 Auth |

## 强制标注

- wire `authorityMode: 'LOCAL_FAKE_DEV'` 是唯一合法值;客户端据此渲染「本地演示」标签（面板头部，title 说明软信任语义）。
- 服务类名 `FakeAuthoritativeLiangService` 不改名、不包装、不重导出为中性名称。
- README/文档描述本地闭环时必须带"本地/演示/软信任"限定词;禁止 verified/secure/可信全网 等表述。

## 生产接线时（Prompt 3+）

- `used/remaining` 切换为 Backend 权威;本地 observed 只作 diagnostics/差异检测（不自动采信较大值）。
- Vote payload 保持最小（caseId/voteType/requestId）;身份与 Token 资格由 Backend 侧解析。
- 若 authority 仍 BLOCKED：生产可信端点保持禁用;staging 明确标注。

## 数据完整性防线

- hydration 若发现 `used > earned`（介质不一致）：响亮告警并向下钳制（宁可少票，不凭空造 Token）;测试 `clamps a persisted ledger…`。
- wire 校验双向执行：host 校验请求体，client 校验帧/响应;不一致帧直接拒收（tests/wire.spec.ts）。
