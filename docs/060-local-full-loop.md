# 060 — 本地完整闭环

`FakeAuthoritativeLiangService`（dev/test adapter，docs/052）+ 自建 HTTP/SSE 通道 + live client store。实机验证截图：`docs/assets/liangbiao-local-full-loop.png`（DSH WebUI @ 3090，demo 种子）。

## 闭环路径

```text
1. 真实 DSH 用量 → tokenUsage 投影 → 水位差分 → daily_usage（050/051）
2. fake 服务派生 earned/remainder/fill/toNext;used/remaining 由其投票账目维护
3. Client（每 tab 一条 SSE）渲染四区;梁气环 = 真实 token 进度 + 剩余香火
4. 用户点 夯：升梁！/拉：降梁！ → POST /liangbiao/api/vote {caseId, voteType, requestId}
5. accepted（同步事务）:
   used +1;remaining -1;up/down +1;total +1;首票 unique_voters +1
   → 响应立即携带新 personal（梁气变弱、ring fill 不动）+ 旧 published 快照
   → UI 显示「已上香：夯（剩余 N 炷）」
6. cadence tick（默认 300s，dev 可 LIANGBIAO_SNAPSHOT_SECONDS=15;测试 fake clock）:
   raw aggregate → 新 published 快照（ratios+state 同一 sequence）
   → SSE 推帧 → 左右比例与中央梁子一起更新;跨阈值播放一次短切换
7. 零票快照 → 待开梁（'--' 比例）;比例跨 50/70/85/95 → 五态切换
```

## 通道

- `GET /liangbiao/api/state`：完整 wire 帧（raw counts;派生在客户端经 domain 构造，保证不变量）。
- `GET /liangbiao/api/events`：SSE;`id:` = revision;每 25s 心跳;插件卸载显式断开全部连接。
- `POST /liangbiao/api/vote`：body ≤4KB、逐字段校验;业务拒绝走 200 + rejected 结果;非法体 400;启动窗口 503。
- 无鉴权（同机 loopback;docs/004 R-6 风险仍适用——本地伪造只影响本机演示账本）。

## 多 tab / 多客户端

- 每 tab 一条 SSE、零轮询;余额只在 host 内存中（单进程同步事务），任何 tab 的投票即时广播——不可能各持独立余额双花（tests: `remaining=1 with 10 concurrent distinct requests`）。

## 离线/降级姿态

- host 不可达：client 保留最近状态并置 `offline`;按钮禁用并给出原因;重开面板触发一次有界重连。
- 缺 token 投影能力：`accounting.available=false` → UI 提示「记账不可用」，其余照常渲染。
- 缺 storage domain：5s 内存降级（响亮告警），闭环仍可用（不跨重启）。

## UI 测试矩阵状态（对应 master §13 A–L）

A 零票待开梁 ✅（empty 种子 + `client-panel`）;B–F 五态比例 ✅（domain/panel/store 阈值矩阵）;G 5 炷+94% ✅;H 投票 remaining 5→4、fill 不变 ✅;I +3000 Token 凝香 ✅;J/K 全局个人解耦 ✅;L 多 tab 不双花 ✅（服务级并发测试 + 单一权威架构）。
