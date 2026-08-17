# SECURITY（控制清单）

报告渠道见仓库根的 [`SECURITY.md`](../SECURITY.md)。威胁模型与「防不住什么」见 [`101`](101-threat-model.md)。本文件列已实现的控制点及其证据。

## 信任模型（先说结论）

`AUTHORITY_MODE=DEV_STAGING_ONLY`。后端对**记账**是权威（不超支、不双花、多标签收敛、业务日与快照版本），对**身份与 Token 真实性不是**（假名安装标识 + 不可验证声明）。因此本仓不是、也不宣称是 secure verified usage voting。

## 输入边界

| 控制 | 实现 |
|---|---|
| 每个 `/v1` 载荷运行时校验 | `shared/backend-v1.ts` 的手写校验器（无新增依赖），Host 与 Backend 共用同一份 |
| 每个 Host↔Client 帧运行时校验 | `shared/wire.ts` |
| 拒绝客户端自报权威字段 | `parseV1VoteRequest` 对 `user_id`/`remaining_incense`/`liangzi_state` 等**报错**而非忽略 |
| 投票只接受三个字段 | `case_id` / `vote_type` / `request_id` |
| `request_id` 格式 | `[A-Za-z0-9._-]{8,128}` |
| 安装标识格式 | `[A-Za-z0-9._-]{8,64}`（拒绝空/过短/超长/路径穿越/注入串/非 latin1） |
| 请求体上限 | 4KB → **413** + `connection: close`（不掐 socket，避免「已拒绝」与「网络故障」不可区分） |
| SQL 注入 | 全部 prepared statement；注入串按字面量处理（审计后五张表完好） |
| 派生值不入库 | 比例/状态/earned/remaining 由 `domain/` 派生，避免第二个真相源 |

## 事务与并发

| 控制 | 实现 |
|---|---|
| 原子扣香 | 单条带条件 `UPDATE`（CAS + 可负担性同语句），`changes()==0` 即余额不足 |
| DB 兜底 | `CHECK (used_incense * token_per_incense <= claimed_effective_tokens)` |
| 幂等 | `UNIQUE (installation_id, request_id)`，只记 accepted，重放返回原结果 |
| 幂等冲突 | 同 id 异载荷 → 409 `idempotency_conflict` |
| 一日一案 | partial unique index `WHERE status='active'` |
| 快照一致性 | 比例与状态由同一行派生；跨进程帧若不自洽则拒收 |
| 事务边界 | `BEGIN IMMEDIATE` + 失败 `ROLLBACK`；`busy_timeout=5000`、WAL |

实测：200 并发抢 1 炷 → 恰好 1 票；200 并发抢 50 炷 → 恰好 50 票；50 并发同 id → 只扣 1 炷。

## 资源与拒服务

| 控制 | 实现 |
|---|---|
| 投票限流 | 每安装每分钟 `LIANGXIANG_VOTE_RATE_LIMIT`（默认 600，0 关闭）→ 429 |
| 限流表不无界增长 | 超过 1000 个安装即清扫过期窗口（安装标识是自造的，否则是攻击者可控的内存增长） |
| 快照历史有界 | 每梁案保留最新 200 条，发布时同事务裁剪 |
| 出站请求 | 全部超时可取消（AbortController），读请求最多一次有界重试，写请求**不自动重试** |
| 资源释放 | `dispose()` abort 在途请求、清 timer、清订阅；SSE 连接在插件卸载时全部关闭 |

## 密钥与日志

- 梁相不读、不存、不发任何 provider 凭据；`.env` 在 `.gitignore` 内。
- 投票日志只含 `method / path / status / installation 前 8 字符 / accepted|rejected`。
- 错误响应不回显请求体（有断言）。
- 详见 [`PRIVACY.md`](PRIVACY.md)。

## 依赖

运行时依赖 **0 个**（只用 `node:http`、`node:sqlite`、React 由 DSH 宿主提供）。`pnpm audit --prod`：无已知漏洞。发布包内容仅 `lib/index.js`、`lib/client.js(.map)`、`cordis.patch.yml`、`README.md`、`LICENSE`、`package.json`。

## 明确未做（因此不要公网暴露）

无 TLS、无鉴权、无配额、无审计日志、无反女巫。后端默认只监听 `127.0.0.1`，公网部署不受支持（[`102`](102-known-limitations.md) 第 4 条）。
