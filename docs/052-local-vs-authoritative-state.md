# 052 — Local Observed vs Authoritative State

Decision Gate A = **A3**（docs/043）：本地一切 Token/身份数据都不是服务器可验证的权威。本文冻结两类状态在代码/文档/UI 中的边界，防止措辞漂移。

## 分类

| 状态 | 本质 | 命名/落点 | 允许用途 | 禁止用途 |
|---|---|---|---|---|
| 每会话 tokenUsage 投影 | DSH 本地折叠 | compat 观测层 | 喂给水位账本 | 直接当票权 |
| `daily_usage` / `watermarks` | **local observed** | `usage-ledger` + storage | 香火进度、断网续积、诊断、本地 earned 计算 | 声称 server-verifiable |
| earned/used/remaining | **本地 fake 权威**（`FakeAuthoritativeLiangService` 派生） | `LOCAL_FAKE_DEV` 模式 wire | 本地投票闭环、UX | 生产可信投票 |
| 全局 up/down/unique/快照 | 本地 fake 聚合 | 同上 | 本地演示全网风向 | 声称真实全网结果 |
| 匿名安装 id | 假名标识（本阶段未使用） | — | 未来去重参考 | 冒充 Auth |

## 强制标注

- wire `authorityMode: 'LOCAL_FAKE_DEV'` 是唯一合法值;客户端据此在面板 dialog 上标注 `data-liangxiang-authority="LOCAL_FAKE_DEV"`，并把 `LOCAL_MODE_NOTE`（"本地演示模式：香火与投票均在本机，不代表可信全网结果"）写入 `aria-live` 摘要。产品要求头部只保留居中的梁案标题，因此不再渲染可见的「本地演示」徽标;README/docs/发布说明仍必须如实标注。
- 服务类名 `FakeAuthoritativeLiangService` 不改名、不包装、不重导出为中性名称。
- README/文档描述本地闭环时必须带"本地/演示/软信任"限定词;禁止 verified/secure/可信全网 等表述。

## Phase 3 已接线（DEV_STAGING_ONLY，2026-08-16）

- `used/remaining` **已**切换为 Backend 权威（`daily_incense_state`）;本地 observed 仅作为 `POST /v1/token-claims` 的**声明**与 UI 诊断，从不自动采信较大值。
- Vote payload 保持最小（`case_id`/`vote_type`/`request_id`）;多带权威字段直接 400。
- authority 仍 BLOCKED：`VERIFIED_PRODUCTION` 在后端启动门禁与 wire 联合类型上双重禁用（[`075`](075-backend-decision.md)）。
- 分类表新增一行：

| 状态 | 本质 | 命名/落点 | 允许用途 | 禁止用途 |
|---|---|---|---|---|
| `claimed_effective_tokens` | **不可验证的声明**（单调 ratchet） | Backend `daily_incense_state` | 派生 staging 票权预算 | 称为 verified usage |
| Backend `used_incense` | **服务端权威**（事务/CAS/幂等） | 同表 | 唯一可花余额、多标签收敛 | 称为“一人一票” |
| 假名 `installation_id` | 自铸可重置标识 | storage domain `identity` 表 | 区分参与安装、幂等域 | 冒充 authenticated user |

## 断连不降级

- `LOCAL_FAKE_DEV` 是用户明确选择的独立自娱玩法，不是在线社区的离线缓存。
- Host 到社区后端断开时，`daily_usage` / `watermarks` 继续写入本机；最近全局快照保留，
  但 authority 标为不可用，夯 / 拉禁用。
- 后端重新可达后，Host 自动提交同一业务日尚未核对的单调 Token claim，读取权威余额，
  再开放夯 / 拉。任何失败路径都不得把社区状态或票带入本地聚合。
- 浏览器到 Host 断开时自动按上限 30 秒退避重连；正常恢复不要求手动刷新。

## 数据完整性防线

- hydration 若发现 `used > earned`（介质不一致）：响亮告警并向下钳制（宁可少票，不凭空造 Token）;测试 `clamps a persisted ledger…`。
- wire 校验双向执行：host 校验请求体，client 校验帧/响应;不一致帧直接拒收（tests/wire.spec.ts）。
