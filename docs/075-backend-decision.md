# 075 — Backend Authority Decision（Phase 3 锁定）

依据 [`043`](043-decision-gate-a.md) 判定 **A3**（Token observable locally, identity/authority not verifiable）。

## 锁定结论

```text
AUTHORITY_MODE = DEV_STAGING_ONLY
```

- 后端 `resolveBackendConfig` 对 `LIANGBIAO_AUTHORITY_MODE=VERIFIED_PRODUCTION` **直接拒绝启动**（`BackendConfigError`，exit 2）。这不是提示，而是启动门禁：想“悄悄升级为可信生产”必须先改代码并留下 diff。
- Host wire 的 `AuthorityMode` 联合类型只有 `LOCAL_FAKE_DEV | DEV_STAGING_ONLY`，`VERIFIED_PRODUCTION` 在 wire 上**不可表示**。
- `/v1` 个人状态永远带 `claim_source: host_observed_unverified` 与 `claim_verified: false`；`claim_verified: true` 会被校验器拒绝。
- UI 屏幕阅读器摘要在该模式下固定播报 `STAGING_MODE_NOTE`（“身份仅为匿名安装标识、Token 用量无法被服务端验证”）。

## A3 信任边界（逐项）

| 事项 | 后端能否保证 | 说明 |
|---|---|---|
| 同一 installation 的香火不被超支 | ✅ | 单条带条件的 `UPDATE`（CAS）+ DB CHECK 约束 |
| 同一 `request_id` 不重复扣香 | ✅ | `UNIQUE (installation_id, request_id)` + 事务内重放 |
| 多标签/多进程收敛到同一余额 | ✅ | 余额只存在于 DB，浏览器无账本 |
| 业务日与活跃梁案 | ✅ | 服务器时钟 + 显式时区，浏览器日期无权 |
| 全局比例与梁子状态同版本 | ✅ | 同一 snapshot 行派生，ratio/state 无独立存储 |
| **投票者是谁** | ❌ | `installation_id` 是自铸、可重置、可伪造的**假名安装标识** |
| **Token 用量是否真实** | ❌ | `claimed_effective_tokens` 是 Host 本地观测**声明**，服务端无法核验 |
| 一人一票 / 反女巫 | ❌ | 无身份即无从谈起（换 installation id 即换池） |

因此本阶段可以诚实地说：**“服务端记账的软信任投票”**；不可以说：secure / verified / cryptographic / server-verified usage voting。

## 重判触发条件（不变）

DSH 上游出现签名用量回执、服务端 usage 查询或可验证身份；或产品明确选择 [`042`](042-auth-trust-model.md) 的路径 ②/③。届时：

1. 重跑 Decision Gate A；
2. 若判定 A1，才允许把 `VERIFIED_PRODUCTION` 加回 `AUTHORITY_MODES` 与 wire 联合类型；
3. `daily_incense_state.claimed_effective_tokens` 需替换为可验证用量来源，并将 `claim_source` / `claim_verified` 改为真实反映来源。

## 生产阻塞项（P0 open risk，仍未解除）

- 无 authenticated identity ⇒ 无法防女巫、无法做真实“全网风向”。
- 无 server-verifiable Token ⇒ 票权预算不可信。
- 结论：**不部署公网、不发布、不声称可信**。本阶段成果的适用范围是 localhost / 团队内 staging / 明确标注的社区软信任玩法。
