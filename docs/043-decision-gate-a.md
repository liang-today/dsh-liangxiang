# 043 — Decision Gate A

依据 [`040`](040-dsh-authority-spike.md)/[`041`](041-dsh-token-mapping.md)/[`042`](042-auth-trust-model.md)（基线 `47f94385`，2026-08-16）。

## 判定：A3

**Token observable locally, identity/authority not verifiable.**

- 身份：DSH 只有可重置的匿名安装 UUID（假名标识），无 authenticated user，外部 Backend 无法核验（040-A1…A8）。
- Token：本地 Host 经公开 `tokenUsage` projection 可精确观测 provider-reported 用量（041），但不存在服务器可验证的用量权威（040-C）。

## 含义

| 事项 | 状态 |
|---|---|
| 本地 Host token projection | ✅ 适合本地 UX / 梁气计量 / dev 演示（本阶段实现） |
| 生产"可信全网投票"Backend | 🔴 **BLOCKED（P0 open risk）**——在 DSH 提供可验证身份与用量前，任何生产票权实现都必然退化为客户端自报软信任 |
| 本阶段继续的工作 | ✅ 真实本地 Token → PersonalLiangQi;✅ `FakeAuthoritativeLiangService` 本地完整闭环（显式 dev/test 命名） |
| 给第三阶段的 authority mode | `AUTHORITY_MODE = DEV_STAGING_ONLY`（除非 Gate 重判） |

## 纪律

- 不发明不存在的 DSH API;不把 anonymous UUID 冒充 Auth;不把 Host 本地可读说成 Backend 可验证;不做客户端持私钥的伪签名;不因开发方便偷偷降级为 soft-trust production。
- 本地闭环产物在 UI/文档中如实标注 `本地演示（LOCAL_FAKE_DEV）`，不声称 verified/secure usage voting。
- 重判触发条件：DSH 上游出现签名用量回执 / server-side usage 查询 / 可验证身份;或产品明确选择 042 所列路径 ②/③。
