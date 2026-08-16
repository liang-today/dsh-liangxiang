# 梁标 V0.1 产品冻结（R2 语义，已按实现回写）

> 本文是产品语义的仓库内快照。**活契约是根目录 [`AGENTS.md`](../AGENTS.md)**。完整执行手册：[`LIANGBIAO_CURSOR_MASTER_R3.md`](LIANGBIAO_CURSOR_MASTER_R3.md)。冲突时以 `AGENTS.md` 为准。
> 2026-08-16：按 `docs/110-prohibition-refresh.md` 全部刷新，与当前实现对齐。

## 一句话

**众人夯梁子，夯到梁成祖；自己攒梁气，攒香继续投。**

梁标不是排行榜，而是围绕"今日梁案"的二元群体投票装置。

## 产品身份

- 产品名：**梁标**；梁文锋在产品语境统一称 **梁子**。
- 入口 Hover/Focus 文案：**今日梁位**（恒定）。
- 入口图标就是当前梁子五态，可拖到画面任意位置（纯外观偏好）。
- 展开面板标题：**今日梁案**。
- 每个 business date 原则上只有一个 Active 梁案。
- 投票只有两个选项：`up` = **夯**、`down` = **拉**。按钮主文案：`夯：升梁！` / `拉：降梁！`。

## 四个视觉区域（不许增删）

1. **今日梁案** — 单一活跃梁案标题。
2. **核心区** — `我的香火 N 炷 | [居中：梁子 + 梁气环 + 香火点] | 下一炷 X Token`，环下单值 **梁位**（全网夯率，6 位小数截断）。中央必须是具象梁子（禁止 Gauge/Donut/Meter/纯文字卡）。个人两翼 overlay，不得把梁子挤离中线。
3. **投票** — 仅 `夯：升梁！` / `拉：降梁！` 两个等宽按钮；可投性只看 `remaining_incense > 0`。升梁/降梁是文案，不是第三选项。
4. **社会化** — `三界香火 N`（今日累计有效票）+ `五行香客 M`（今日至少成功投过一票的独立用户）+ 同行 **上达天听**。

## 中央梁子（全局，唯一驱动 = 全网夯率）

```text
total_votes == 0        -> WAITING / 待开梁（占位态，不是第六 Tier）
up_ratio  < 20%         -> 梁工
20% <= up_ratio < 40%   -> 梁总
40% <= up_ratio < 60%   -> 梁神
60% <= up_ratio < 80%   -> 梁圣
up_ratio >= 80%         -> 梁祖
```

- 个人 Token / earned / used / remaining / 梁气进度 **不得**直接选择梁子状态。
- 梁位与梁子状态必须来自**同一个快照版本**（禁止 79% 配梁圣这类漂移）。
- 零票梁位显示 `--`，不伪造 50/50，不用 Bayesian prior。

## 个人梁气（无个人 Tier）

梁气只回答两个问题：

1. 还剩几炷香可投？→ `remaining_incense` 决定梁气**旺盛程度**（表现层连续标量，非业务等级）。
2. 距下一炷还差多少 Token？→ `token_remainder / token_per_incense` 决定梁气环 **fill**。

- `我的香火 N 炷` / `下一炷 X Token` 作为环左右两翼 overlay，禁止单独的"个人成长层"；环/头像/香火点必须居中。
- 投票成功：`remaining -1`，梁气可变弱；**但 remainder/fill/toNext 不变**。
- Token 跨过 50K：`earned/remaining +1`，remainder 回绕到 0，播放一次短"凝香 +1 炷"。

## Token → 香火

```text
LIANG_TOKEN_PER_INCENSE = 50000（可配置，不散落硬编码）
Effective Token = Input + Output
DSH 映射：input = uncachedInput + cacheRead + cacheWrite；effective = input + output
```

- reasoning 已含于 output，不重复计。
- 不用 Context Occupancy，不用 UI 估算，不用旧 cacheRead×0.1 公式，不 mint 梁签。
- V0.1 不做目标模型过滤。

```text
earned  = floor(effective_tokens_today / token_per_incense)
used    = accepted_up_by_me + accepted_down_by_me
remaining = earned - used            （夯/拉共用一个池）
remainder = effective_tokens_today % token_per_incense
fill      = remainder / token_per_incense
toNext    = token_per_incense - remainder
```

## 投票规则

- 1 accepted vote = 1 used incense，无倍率。
- 允许连续夯、连续拉、夯拉混投，次数只受 remaining 限制。
- `request_id` 幂等：同 payload 重试返回同一结果，不重复扣香/计票/加香客；冲突 payload 拒绝。
- remaining=1 时并发 N 个请求，最多成功 1 个（由权威层保证，不靠按钮禁用）。

## 权威与安全

- 前端不得自报 user_id / effective_tokens / earned / used / remaining / liangzi_state 并要求后端信任。
- 匿名 ID ≠ Auth；本地 Host 可读投影 ≠ 服务端可验证 authority。
- 当前 DSH 若无可验证身份/Token authority：标 P0 BLOCKED，不发明 API、不偷偷降级。
- 隐私红线：永不记录/传输 prompt、模型输出、代码、文件内容/路径、密钥、原始会话日志。

## 明确废弃（禁止回归）

`稳`/第三选项、candidate/ranking/leaderboard/winner/top-N、大夯/偏夯/胶着/偏拉/大拉、LiangScore/Bayesian、BallotLedger/LiangBallot/梁签票权、小难梁/牢梁/老梁、旧个人五态（梁哥→…→梁祖）、个人 earned 驱动中央头像、"投票不能降梁气"、cacheRead 10% 权重、"一人一票"。
