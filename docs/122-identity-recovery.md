# 122 — 安装标识与密钥（自助删钥 / 指纹接管 / 运营 CLI）

## 问题

安装标识是一个 Ed25519 密钥对，首次安装时铸一次。后端把
`device_fingerprint`（本机 MAC 的 SHA-256）唯一绑定到这一个标识。

运营改梁案如果走 HTTP，就要对公网开一个带社区口令的端口。口令会随
请求离开机器。改为：**梁案与运营解绑只在 VPS 本机用 CLI 写 SQLite**，
HTTP 不再提供 `/v1/admin/*`。

用户自己的私钥只有自己有，可以随时删自己的标识；但必须限频，避免被
拿来当扫描器。

## 方案

### 1. 运营：CLI only（不开端口）

在放数据库的那台机器上：

```bash
pnpm run build
node lib/backend-cli.js case publish "新题是夯还是拉"
node lib/backend-cli.js case queue list
node lib/backend-cli.js case queue add [--on YYYY-MM-DD] "明日题是夯还是拉"
node lib/backend-cli.js identity unbind lk_旧id
```

脚本 `scripts/publish-case.sh` / `scripts/queue-case.sh` 也改走这条 CLI。
`POST /v1/admin/cases`、`/v1/admin/queue`、`/v1/admin/identity/unbind` 一律 404。

### 2. 用户自助删钥 `POST /v1/identity/revoke`

用**自己的私钥**签名。命中已登记公钥则删掉该 identity 行（香火弃号，不转移）。

### 3. 指纹接管 `POST /v1/identity/rekey`（保留）

同机重铸密钥后，等旧标识静默超过 `LIANGXIANG_REKEY_COOLDOWN_MS`（默认 24h）
才能接管指纹。旧香火仍不转移。

### 4. 频率限制（两条路径共用）

| 判定 | 窗口 | 键 |
|---|---|---|
| **命中**（公钥或指纹已在 `community_identity`） | 10 分钟 | 同一 IP + installation |
| **未命中**（怀疑扫描/攻击） | 30 分钟 | 同一 IP |

每次尝试（成功或拒绝）都打日志：`revoke` / `rekey` + `kind=hit|miss` + install 前缀 + ip。
超限返回 `429 identity_rate_limited`。

计时：命中只在**成功**时刷新 10 分钟窗（误点不会把冷却再推后）；未命中每次尝试都刷新 30 分钟窗（扫钥会把自己锁得更久）。

## 各类情况怎么走

| 情况 | 表现 | 处理 |
|---|---|---|
| 干净新设备首次装 | bootstrap 铸新 id | 无需处理 |
| 用户想扔掉自己的密钥 | `POST /v1/identity/revoke`（自己签） | 10 分钟一次；香火弃号 |
| 同机重铸密钥 | 指纹仍绑旧 id → `409 device_conflict` | 等 24h 后 re-key，或 VPS 上 CLI `identity unbind` |
| 随机钥打 revoke/rekey | 公钥未命中 | 该 IP 30 分钟一次，打可疑日志 |
| 复制了 `.dsh-home` | 与源机器同 id | 目标机 `pnpm run reset:identity` |

## 配置

- `LIANGXIANG_REKEY_COOLDOWN_MS`：指纹接管冷却（默认 86400000）。`0` 仅测试。

## 测试

`tests/identity-recovery.spec.ts`、`tests/operator-identity.spec.ts`、
`tests/community-auth.spec.ts`、`tests/backend-http.spec.ts`（admin 路由 404）。
