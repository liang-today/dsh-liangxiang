# 042 — 信任模型（Trust Table）

基线 `47f94385`。"Backend verifiable" 指未来梁标云端能在不相信客户端自报的前提下核验该数据。

| Source | Host 可读 | Browser 可读 | 梁标 Backend 可验证 | 用户可篡改 | 适合生产票权 authority |
|---|---|---|---|---|---|
| Browser state（store/DOM/localStorage） | — | ✅ | ❌ | ✅ 任意 | ❌ 永不 |
| Host 本地 `tokenUsage` projection | ✅（sessionProjections） | ❌（经梁标自建通道间接） | ❌（纯本地折叠，无签名/回执） | ✅（本地进程/文件可改） | ❌（仅 UX/本地演示） |
| 会话日志（durable log 文件） | ✅ | ❌ | ❌ | ✅（本地文件） | ❌ |
| `anonymous-user-id`（`$DSH_HOME/.anonymous-user-id`） | ✅ | ❌ | ❌（明文 UUID，可复制/重置/伪造） | ✅（删除即重置） | ❌（仅假名去重参考） |
| DeepSeek provider response usage（API 网关侧记录） | 间接（事件里的 provider 上报值） | ❌ | **理论上仅 DeepSeek 网关自身可信持有**;当前无对第三方查询/核验 API | ❌（服务端持有） | ⚠️ 当前不可用（无 API;若未来开放签名回执/查询则为最优解） |
| 发现的 remote usage API | 不存在 | 不存在 | — | — | —（无此物） |
| OTel telemetry 上报 | ✅（自动） | ❌ | ❌（运营遥测，非查询面;可被用户禁用） | ✅（`DSH_TELEMETRY_DISABLED`） | ❌ |

## 红线（AGENTS.md §9 落地）

- 本地 Host 可读 ≠ 服务器可验证;两者在代码与文档中必须分开命名（`LocalObservedDailyUsage` vs 未来 `authoritative_effective_tokens`）。
- anonymous UUID 不冒充 Auth;不做"私钥在客户端"的伪签名。
- 生产 Vote endpoint 在获得可验证身份+用量前保持 **BLOCKED**;本地闭环使用显式命名的 `FakeAuthoritativeLiangService`（dev/test adapter），不得包装成 production Auth。
- 唯一现实的解锁路径（供未来决策，不替产品拍板）：① DSH 上游增加签名用量回执/服务端查询;② 梁标引入独立账号 + 服务器侧可验证用量;③ 用户明确接受 soft-trust 社区模式;④ 只发布本地 demo。
