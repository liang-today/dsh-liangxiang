# 122 — 安装标识恢复（换新设备 / 重铸密钥 / 复制了 `.dsh-home`）

## 问题

安装标识是一个 Ed25519 密钥对，首次安装时铸一次，存进 DSH 存储域
（`$DSH_HOME/storages/liangbiao.json` → `tables.identity.installation`）。
后端把 `device_fingerprint`（本机 MAC 的 SHA-256）**唯一绑定**到这一个标识：

- 同一台机器、同一个指纹，重新铸密钥 → 后端 `409 device_conflict`；
- 把 `.dsh-home`（或那个 JSON）拷到第二台机器 → 第二台机器连私钥带指纹一起
  骑了原标识，表现成同一个香客。

早期实现里这个绑定**永久生效、无解**。本方案加了两种「有代价」的恢复路径。

## 代价

无论哪种恢复，旧标识的**香火/投票都不转移**：它留在死掉的旧 id 上，新 id 从 0
开始。这是恢复的固有代价——重铸密钥 = 放弃旧香客身份。

## 两条恢复路径

### A. 自助 re-key（有冷却）

`POST /v1/identity/rekey`，由**新密钥**签名（跳过指纹绑定校验）。只有当旧标识
已静默超过 `LIANGBIAO_REKEY_COOLDOWN_MS`（默认 **24h**）时才允许接管指纹；
否则返回 `409 rekey_cooldown`（提示还需等多久）。

```bash
curl -X POST "$BACKEND/v1/identity/rekey" \
  -H 'x-liangbiao-community-key: <社区口令>' \
  -H 'x-liangbiao-installation: <新 lk_ id>' \
  -H 'x-liangbiao-public-key: <新公钥 base64url>' \
  -H 'x-liangbiao-device: <本机指纹>' \
  -H 'x-liangbiao-timestamp: <毫秒>' \
  -H 'x-liangbiao-signature: <签名>' \
  -H 'content-type: application/json' -d '{}'
```

签名规范与其它 `/v1` 一致（`communityAuthMessage`，见 `backend-v1.ts`）。

### B. 运营强制解绑（立即，社区口令）

`POST /v1/admin/identity/unbind`，社区口令认证，删掉绑定行、立刻释放指纹。
用于**误删密钥等紧急情况**（不用等 24h）。

```bash
curl -X POST "$BACKEND/v1/admin/identity/unbind" \
  -H 'x-liangbiao-community-key: <社区口令>' \
  -H 'content-type: application/json' \
  -d '{"installation_id": "lk_旧id"}'
```

解绑后设备重新注册：若仍持旧私钥 → 恢复旧 id（香火保留）；若已重铸 → 新 id（从 0）。

## 各类情况怎么走

| 情况 | 后端表现 | 处理 |
|---|---|---|
| 干净新设备首次装 | 自动铸新 id，绑定新指纹 | 无需处理 |
| 复制了 `.dsh-home`（骑了别人 id） | 与源机器同 id、同香客 | 目标机 `pnpm run reset:identity` + 重启 → 铸新 id + 本机指纹 |
| 同机重铸密钥（误删/故意） | `409 device_conflict` | 等 24h 后 re-key，或运营 `unbind` 立即放行 |
| 无 MAC 指纹（VM/WSL/容器） | 指纹为 null，不绑定 | 天然可重铸，无 409 |

## 配置

- `LIANGBIAO_REKEY_COOLDOWN_MS`：re-key 冷却（毫秒，默认 `86400000`）。`0`
  关闭冷却（仅测试/运营自用）。

## 测试

`tests/identity-recovery.spec.ts`（re-key 冷却/接管/弃号、运营解绑）、
`tests/community-auth.spec.ts`（`skipFingerprintEnforcement` 只校验签名不绑定）。
