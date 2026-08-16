# 101 — Threat Model（v0.1 / AUTHORITY_MODE=DEV_STAGING_ONLY）

前提：Decision Gate A = **A3**（[`075`](075-backend-decision.md)）。没有可验证身份，也没有可验证 Token 用量。本文把「能防住的」和「防不住的」分开写清，避免把 staging 当生产。

## 资产

1. 个人当日香火账（`used_incense`）——被超支就等于凭空造票权。
2. 全局聚合与已发布快照——被污染就等于全网风向失真。
3. 业务日与活跃梁案——被绕过就能跨日重复投。
4. 用户隐私（prompt/代码/密钥绝不能出网）。

## 攻击面与结论

| # | 攻击 | 结果 | 依据 |
|---|---|---|---|
| T1 | 客户端在投票体里自报 `remaining_incense` / `user_id` / `liangzi_state` | **被防住**：400 且带字段路径（不是忽略，是拒绝） | `parseV1VoteRequest`；`backend-http.spec.ts`、审计 |
| T2 | remaining=1 时并发 100/200 次投票超支 | **被防住**：恰好 1 票（单条条件 UPDATE + DB CHECK） | `072`；审计 200 并发 |
| T3 | 同 `request_id` 重放/并发重放 | **被防住**：只扣一次香、只计一票、只加一次香客 | `UNIQUE(installation_id, request_id)` |
| T4 | 同 `request_id` 换方向 | **被防住**：409 `idempotency_conflict` | 同上 |
| T5 | 多标签/多进程各自记账 | **被防住**：余额只存在于 DB，浏览器无账本 | `072` |
| T6 | 用浏览器时钟/时区跨日重投 | **被防住**：业务日由服务器时钟 + 配置时区决定，旧 case 被拒 | `073` |
| T7 | SQL 注入（case_id / request_id / vote_type / claim / header） | **被防住**：全部 prepared statement + 格式校验；注入串按字面量处理 | 审计（五张表事后完好） |
| T8 | 超大 body / 畸形 JSON / 数组 / null | **被防住**：413（结构化，不掐连接）/ 400 | `076`、`backend-http.spec.ts` |
| T9 | 用自造 installation id 刷内存（限流表膨胀） | **被防住**：限流表超阈值即清扫过期窗口 | `backend-http.spec.ts` |
| T10 | 日志/响应泄漏 prompt/路径/密钥 | **被防住**：日志只含 status + id 前缀；错误不回显请求体 | [`PRIVACY.md`](PRIVACY.md) |
| **T11** | **伪造身份**：随便换一个 installation id 就是「新人」 | **防不住** | A3 无身份 |
| **T12** | **伪造 Token**：直接 POST 一个巨大的 `claimed_effective_tokens` | **防不住**（只保证不回退，不保证为真） | A3 无可验证用量 |
| **T13** | **女巫刷票**：批量安装标识 × 伪造 claim ⇒ 任意操纵梁位 | **防不住**（= T11 + T12） | A3 |
| T14 | 公网暴露后端 | **未评估**：无 TLS、无鉴权、无配额；本阶段只监听 127.0.0.1 | [`102`](102-known-limitations.md) |

## 结论

T1–T10 是「诚实记账」的部分，已实现并有测试。T11–T13 是 A3 的结构性缺口，**不可能**在当前 DSH 能力下修好，因此：

- 不部署公网、不发布、不宣称 verified/secure；
- `VERIFIED_PRODUCTION` 在启动门禁与 wire 类型上双重禁用；
- 任何「全网风向」的表述都必须带「本地/预发/软信任」限定词。

## 若要迈向可信

按优先级：可验证身份（OIDC 之类）→ 服务端可验证用量（签名回执或服务端 usage 查询）→ 反女巫配额 → 公网加固（TLS、鉴权、速率与配额、审计）。前两项不在梁标可控范围内，取决于 DSH 上游。
