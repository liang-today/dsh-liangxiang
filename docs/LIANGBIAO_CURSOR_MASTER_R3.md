# 梁标 V0.1 — Cursor 一体化开发手册（R3）

> 将本文件放入梁标仓库：`docs/LIANGBIAO_CURSOR_MASTER_R3.md`。
> 本文件前半部分是产品/技术事实源，后半部分是 4 个最终执行 Phase。
> Cursor 必须以本文件为最高优先级梁标产品语义；`../deepseek-harness` 仅作为只读 API/运行时事实源。

---

# PART A — 产品冻结与技术事实源


> 用途：新会话交接 / Cursor 分阶段开发执行  
> 产品版本：**V0.1**  
> Prompt Pack Revision：**R2**  
> 日期：2026-08-16  
> 重要原则：本文档覆盖此前所有与梁标业务语义冲突的 Prompt、设计、测试不变量和数据模型。若旧内容与本文冲突，以本文为准。

---

## 0. 新会话先读：唯一正确的产品认知

**梁标不是排行榜，而是围绕“今日梁案”的二元群体投票装置：用户日常使用 DSH 所产生的 Input+Output Token 转化成个人香火，以香火投“夯”或“拉”；全网夯/拉比例共同决定中央“梁子”的五态，个人剩余香火与距离下一炷香的 Token 进度共同形成“梁气”；底部以全局香火和香客形成社会化反馈。**

一句话产品口诀：

> **众人夯梁子，夯到梁成祖；自己攒梁气，攒香继续投。**

### 产品名与入口

- 产品名：**梁标**
- 梁文锋在产品语境中统一称为：**梁子**
- DSH WebUI 悬浮入口 Hover / Focus 提示：**今日梁位**
- 展开面板主标题：**今日梁案**
- 每天原则上只有一个 Active 梁案
- 投票永远只有两个选项：
  - **夯**
  - **拉**

### 明确禁止恢复的旧设计

后续任何设计、代码、测试和 Prompt 都不得重新引入：

- `稳`
- 第三个投票选项
- Candidate Ranking
- Winner Ranking
- Top-N
- #1 / #2 / #3 梁位
- leaderboard
- winner
- candidate
- 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉
- 用个人 Token、个人 earned incense、个人 remaining incense 驱动中央梁子五态
- 把梁气定义成全局支持率或全局梁位
- 把梁气定义成个人 Avatar Tier / 个人成长等级
- 单独增加“距下一 Tier 还差几炷”等个人等级文案
- 用普通 Gauge / 百分比仪表替代中央具象梁子
- 把用户 Token、票权、香火余额交给前端自行声明并让服务端直接相信
- “一人一票”
- 旧版七档“小难梁/牢梁/梁子/老梁/梁圣/梁神/梁祖”
- 旧版个人五态“梁哥→梁总→梁神→梁圣→梁祖”
- 旧版 `LiangScore` / Bayesian prior / 全局 0–100 梁分模型
- 旧版 `梁签` 作为核心票权对象

---

# 1. 冻结后的产品逻辑

## 1.1 页面结构：四个视觉区域

梁标展开后，从上到下保持四个视觉区域。不要再额外制造“个人成长层”。

### Region 1 — 今日梁案

```text
今日梁案

DeepSeek Harness 是夯还是拉
```

只展示当前 Active 梁案。

### Region 2 — 中央核心区

```text
夯 83%        [梁子：梁圣 + 个人梁气环]        拉 17%
```

规则：

- 左侧只展示全局 `up_ratio`
- 中央必须是具象化“梁子”角色位
- 右侧只展示全局 `down_ratio`
- 中央梁子不是 Gauge、Donut、Meter 或纯文字卡片
- 中央梁子的形态由**全网夯比例**唯一决定
- 梁子外围的“梁气”只属于**当前用户个人**
- 梁子五态与梁气必须视觉叠加、数据解耦

### Region 3 — 两个投票按钮

```text
[ 夯！ ]        [ 拉！ ]
```

只有两个按钮。

- 是否还能投，只看个人 `remaining_incense > 0`
- 不再单独占一整行重复显示“可用香火：N 炷”，个人可用香火直接整合进梁气视觉
- `remaining_incense = 0` 时两个按钮进入解释性 disabled 状态

### Region 4 — 社会化数据

```text
🔥 香火 12,846      👤 香客 2,841
```

定义：

- **香火**：今日梁案累计有效投票总数
- **香客**：今日至少成功投过一次票的独立用户数

---

## 1.2 中央梁子：待开梁 + 五态

统一状态：

```text
WAITING      -> 待开梁
LIANG_GONG   -> 梁工
LIANG_ZONG   -> 梁总
LIANG_SHEN   -> 梁神
LIANG_SHENG  -> 梁圣
LIANG_ZU     -> 梁祖
```

其中：

- **待开梁不是第六个 Tier**，只是 `total_votes = 0` 时的占位状态
- 五态只在已经有有效投票后生效

### 五态唯一驱动：全网夯比例

```text
if total_votes == 0:
    liangzi_state = WAITING
else if up_ratio < 0.60:
    liangzi_state = LIANG_GONG
else if up_ratio < 0.70:
    liangzi_state = LIANG_ZONG
else if up_ratio < 0.80:
    liangzi_state = LIANG_SHEN
else if up_ratio < 0.90:
    liangzi_state = LIANG_SHENG
else:
    liangzi_state = LIANG_ZU
```

冻结边界：

| 全网夯占比 | 梁子状态 |
|---|---|
| 0 票 | 待开梁 |
| `< 60%` | 梁工 |
| `60% <= x < 70%` | 梁总 |
| `70% <= x < 80%` | 梁神 |
| `80% <= x < 90%` | 梁圣 |
| `>= 90%` | 梁祖 |

### 五态视觉方向

建议保持“一个正常人一路被全网夯成祖宗”的荒诞升级：

- **待开梁**：灰度 / 空位 / 未点香 / 低存在感
- **梁工**：工牌、朴素、正常上班人
- **梁总**：西装、桌牌、气场上升
- **梁神**：光环、轻悬浮、开始显灵
- **梁圣**：圣光、法相、庄严但搞笑
- **梁祖**：祖师法相、满梁威、最高荒诞感

具体 artwork 可以后换，但状态语义不得变化。

### 明确禁止

中央梁子状态不得直接依赖：

```text
effective_tokens_today
earned_incense_today
used_incense_today
remaining_incense
tokens_to_next_incense
liang_qi_fill
liang_qi_intensity
```

个人 Token / 香火再高，也不能把全网只有 65% 夯的梁子显示成梁祖。

---

## 1.3 梁气：个人香火库存 + 下一炷 Token 进度

梁气没有个人 Tier，没有“梁哥→梁祖”的个人成长含义。

梁气只回答两个问题：

1. **我现在还剩几炷香可以投？**
2. **距离下一炷香还差多少 Token？**

### 梁气的两个视觉变量

#### A. 已有几炷香 -> 决定“旺盛程度”

```text
remaining_incense
```

用于决定：

- 梁气粒子数量
- 火苗数量或密度
- 气旋强弱
- halo 强度
- 微光密度

这是表现层映射，不需要业务 Tier。

例如：

```text
0 炷 -> 几乎无梁气，仅保留下一炷进度环
1 炷 -> 微弱
3 炷 -> 明显
5 炷 -> 旺盛
10+ -> 很旺，但避免失控闪烁
```

具体 intensity 曲线由 UI 设计决定，可使用 clamp/log/sqrt 等平滑映射，不要创造新的产品等级。

#### B. 距离下一炷香的 Token 进度 -> 决定梁气环从空到满

```text
token_remainder
= effective_tokens_today % token_per_incense

liang_qi_fill
= token_remainder / token_per_incense

tokens_to_next_incense
= token_per_incense - token_remainder
```

当 `token_remainder = 0` 时：

```text
tokens_to_next_incense = token_per_incense
liang_qi_fill = 0
```

表示刚获得完整香火后，开始积累下一炷。

### “再 3,000 Token 得 1 炷”必须整合进梁气环

不要额外再做一整行个人成长文案。

推荐视觉语义：

```text
梁气环内部或沿环：
5 炷
再 3,000 Token
```

或者等价的紧凑表达。

要求：

- “5 炷”与梁气旺盛程度一致
- “再 3,000 Token”与环形填充一致
- 两者属于同一个 LiangQi 组件
- 不要出现“距离梁圣还差 3 炷”之类旧语义

### 投票和 Token 对梁气的影响

假设当前：

```text
remaining_incense = 5
token_remainder = 47,000
tokens_to_next_incense = 3,000
liang_qi_fill = 94%
```

投一票后：

```text
remaining_incense: 5 -> 4
```

因此梁气**旺盛程度下降**。

但：

```text
token_remainder 仍是 47,000
liang_qi_fill 仍是 94%
tokens_to_next_incense 仍是 3,000
```

再产生 3,000 Token 后：

```text
earned_incense += 1
remaining_incense += 1
token_remainder -> 0
liang_qi_fill -> 0
tokens_to_next_incense -> 50,000
```

UI 可播放一次短暂“凝香 / +1 炷”效果，然后重新开始下一炷进度。

---

## 1.4 Token -> 香火

V0.1 冻结：

```text
50,000 Effective Token
= 1 炷香
= 1 次投票资格
```

配置：

```text
LIANG_TOKEN_PER_INCENSE = 50000
```

必须可配置，不得散落硬编码。

### Effective Token 产品定义

```text
Effective Token
= Input Token + Output Token
```

若 DSH 当前 provider-reported Token Meter 将 Input 拆成互斥 bucket：

```text
uncachedInputTokens
cacheReadTokens
cacheWriteTokens
```

则 V0.1 对 DSH 的技术映射应为：

```text
input_tokens_total
= uncachedInputTokens
+ cacheReadTokens
+ cacheWriteTokens

effective_tokens
= input_tokens_total
+ outputTokens
```

注意：

- 不再使用旧版 `cacheReadTokens * 0.1`
- `cacheWriteTokens` 不再是 0 权重
- reasoning 若已经包含在 `outputTokens`，绝不能重复累计
- 只使用 provider-reported token usage
- 不使用 Context Occupancy
- 不使用 UI 估算 Token

计算：

```text
earned_incense_today
= floor(effective_tokens_today / LIANG_TOKEN_PER_INCENSE)

used_incense_today
= accepted_up_votes_by_me + accepted_down_votes_by_me

remaining_incense
= earned_incense_today - used_incense_today
```

个人梁气用：

```text
token_remainder
= effective_tokens_today % LIANG_TOKEN_PER_INCENSE

tokens_to_next_incense
= LIANG_TOKEN_PER_INCENSE - token_remainder

liang_qi_fill
= token_remainder / LIANG_TOKEN_PER_INCENSE
```

`remaining_incense`、`tokens_to_next_incense`、`liang_qi_fill` 推荐作为可重算派生值。

---

## 1.5 投票

投票永远二元：

```text
up   // UI = 夯
down // UI = 拉
```

用户允许：

- 连续投夯
- 连续投拉
- 先夯后拉
- 当天投任意多次
- 唯一限制是 `remaining_incense > 0`

一炷香严格对应一张有效票：

```text
1 successful vote = 1 used incense
```

不做额外倍率。

### 个人香火池是夯/拉共享池

不是：

```text
5 炷夯票 + 5 炷拉票
```

而是：

```text
remaining_incense = 5
```

则最多还能成功投 5 次，方向任意。

不变量：

```text
accepted_up_votes_by_me
+ accepted_down_votes_by_me
= used_incense_today

used_incense_today <= earned_incense_today
```

### 并发

只剩一炷香时并发提交 N 个 Vote：

```text
最多成功 1 个
```

### 幂等

每次客户端意图包含：

```text
request_id
```

相同 `request_id`：

- 同 payload 重试：必须返回同一业务结果
- 不得再次扣香
- 不得再次计票
- 不得再次增加香客
- 若同 `request_id` 携带冲突 payload：明确拒绝

---

## 1.6 全局夯拉结果与梁子五态

全局只计算：

```text
up_votes
down_votes
total_votes = up_votes + down_votes
```

有票时：

```text
up_ratio = up_votes / total_votes
down_ratio = down_votes / total_votes
liangzi_state = f(up_ratio)
```

无票时：

```text
up_ratio = null
down_ratio = null
liangzi_state = WAITING // 待开梁
```

UI：

- 左右比例显示 `--`
- 中央显示“待开梁”占位形态
- 不伪造 50/50
- 不使用 Bayesian prior

示例：

```text
up_votes = 10,665
down_votes = 2,181
total_votes = 12,846
up_ratio ~= 83%
```

显示：

```text
夯 83%
梁圣
拉 17%
```

当全网投票把夯率推过 90% 后：

```text
梁圣 -> 梁祖
```

这是中央梁子状态变化的唯一业务路径。

---

## 1.7 香火与香客

### 全局香火

```text
total_incense
= up_votes + down_votes
```

只统计后台接受的有效票。

### 全局香客

```text
unique_voters
```

定义：

> 今日梁案至少成功投过一次 Vote 的唯一用户数。

同一用户投 20 次：

```text
total_incense += 20
unique_voters += 1
```

---

## 1.8 两组产品状态 + 一个交易层

产品语义不要再拆成“个人成长 Tier”。

### A. GlobalLiangState

```text
case_id
business_date
up_votes
down_votes
total_incense
unique_voters
up_ratio
down_ratio
liangzi_state
snapshot_at
```

唯一负责：

- 全网夯拉风向
- 中央梁子待开梁/五态
- 全局香火/香客

### B. PersonalLiangQiState

```text
effective_tokens_today
earned_incense_today
used_incense_today
remaining_incense
token_remainder
tokens_to_next_incense
liang_qi_fill
```

表现层可额外派生：

```text
liang_qi_intensity = presentationFunction(remaining_incense)
```

唯一负责：

- 个人还有几炷香
- 下一炷积累到哪里
- 是否还能投票
- 梁气视觉

### C. Vote Transaction / Ledger

```text
VoteIntent
VoteRecord
request_id
vote_type
```

负责：

- 原子扣除一炷
- 计入全局 up/down
- 幂等
- 并发防双花

不要把三者塞进一个 `score` / `liang_state` / `growth_state`。

---

# 2. 现有 Prompt 错误影响清单

## 2.1 旧 AGENTS.md：高影响，必须修订

旧版中以下语义已经失效：

- 中央五态由 `earned_incense_today` 驱动
- “投票不能让梁气倒退”
- 梁气环表示个人 Tier 成长
- “距下一 Tier 还差 N 炷”
- `梁哥` 作为 V0.1 第一档
- Global ratio 与 Avatar 完全解耦
- Avatar 不因 global ratio 变化

正确语义改为：

- 中央梁子状态由 `up_ratio` 驱动
- 0 票是 `待开梁`
- 五态是 `梁工 / 梁总 / 梁神 / 梁圣 / 梁祖`
- 梁气旺盛程度由 `remaining_incense` 驱动
- 梁气环 fill 由下一炷 Token 进度驱动
- 投票会降低梁气旺盛程度，但不会改变下一炷 Token 进度
- global snapshot 比例跨阈值时，中央梁子必须切换五态

## 2.2 Prompt 00：部分受影响，不必推倒重跑

仍然有效：

- DSH Host/Client 插件结构
- UI Slot 勘察
- Client Module
- Host/Client 通信
- Session Projection
- Persistence
- Plugin packaging
- HMR
- public/internal API 分类

需要补充勘察：

- DSH Current User / Auth 是否存在可供第三方插件使用的可信身份
- DSH 是否存在服务器侧可验证的 Token 使用数据
- `Input + Output` 在当前 Token Meter 四 bucket 中的精确映射
- business date / timezone 应由谁负责
- DSH toast/dialog/theme conventions
- DSH backend/API/BFF patterns
- DSH transaction/idempotency patterns
- anonymous identity 是否只是匿名 ID，而非 Auth
- 是否存在票权服务端可信计算的可行链路

处理方式：不重跑 Prompt 00，新增 Prompt 04 / DSH Self-check A 做 Authority Spike。

## 2.3 Prompt 01：工程骨架可保留

旧 Prompt 01 的 package / Host / Client / build / profile 结构不依赖本次产品语义。

但 Prompt 01B 必须再次覆盖旧业务规则，确保后续 Cursor 不再读取错误不变量。

## 2.4 Prompt 02：完全重写

必须纠正：

- 由五层改为四个视觉区域
- 去掉独立“个人成长状态”层
- 中央梁子由全网夯率决定
- 梁气与梁子视觉叠加、数据解耦
- 个人 `remaining_incense` 决定梁气旺盛程度
- `tokens_to_next_incense` 直接整合进梁气环
- 0 票显示待开梁

## 2.5 Prompt 03：完全重写

必须从旧：

- Personal Avatar Tier
- LiangQi personal tier progress
- global/avatar independence

改为：

- `GlobalLiangState`
- `LiangziStatePolicy(up_ratio)`
- `PersonalLiangQiState`
- `IncenseAccountingPolicy`
- `LiangQiFillPolicy`
- 全局比例阈值边界测试
- 个人投票扣香只影响梁气强弱，不直接驱动梁子状态

## 2.6 Prompt 04：Authority Spike 保留，产品描述需纠正

核心安全问题不变：

- server-verifiable identity
- server-verifiable token authority
- business date authority

但所有“中央 Avatar 由个人 earned 驱动”的描述必须删除。

## 2.7 Prompt 05：完全重写

真实 DSH Token 只驱动：

```text
effective_tokens_today
-> earned_incense_today
-> token_remainder
-> tokens_to_next_incense
-> liang_qi_fill
```

不能驱动梁子五态。

## 2.8 Prompt 06：完全重写

本地闭环必须验证：

- 个人 Token / 香火 -> 梁气
- 全局 accepted votes -> ratio -> 梁子五态
- 投票会减少梁气旺盛程度
- 投票不改变下一炷 token fill
- 全局 ratio 跨阈值后梁子五态变化
- 0 票待开梁

## 2.9 Prompt 07–09：服务端/在线集成高影响，必须修订

必须保证：

- Personal state 不再包含个人 Avatar Tier
- Global snapshot 可包含/派生 `liangzi_state`
- 在线 UI 的梁子状态只来自 authoritative global snapshot
- 在线 LiangQi balance/progress 只来自 authoritative personal state，或在无法验证时明确 provisional

## 2.10 Prompt 10 / 11 / Codex Reviews：全部修订验收重点

必须删除旧不变量：

- avatar tier depends only on earned incense
- global ratio does not control avatar
- spending incense must never downgrade avatar

替换为：

- Liangzi state depends only on global up ratio / zero-vote waiting state
- Personal incense never directly selects Liangzi state
- vote spend changes personal LiangQi intensity
- Token remainder controls ring fill
- global snapshot threshold crossings change Liangzi state

---

# 3. Prompt 01 是否需要纠偏 Patch

## 结论

**需要执行新版 Prompt 01B，但只做最小业务语义 Patch，不重做工程骨架。**

原因：

1. 旧 Prompt Pack 已把个人 earned incense 写成中央五态唯一驱动
2. 旧文档把梁气写成个人 Tier 成长环
3. 后续 Cursor 会持续读取 AGENTS.md 和 docs
4. 不先修长期规则，Prompt 02+ 会再次被污染

---

# 4. Prompt 01B：业务语义纠偏 Patch（R2）

> Cursor 新 Chat。先 Plan，再 Agent。不得重构已成功的 DSH skeleton。

```text
我们刚刚再次冻结了“梁标 V0.1”的最终产品语义。

当前 Prompt 01 已经完成 DSH 插件工程骨架。不要推倒、不要重做 package/Host/Client/build/profile 安装结构。

本阶段只做最小化“业务语义纠偏 Patch R2”。

第一步：阅读：

- 当前仓库 AGENTS.md
- docs/PRODUCT_FREEZE_V0.1.md（如存在）
- Prompt 01/01B 生成的 src/shared/domain/host/client placeholder
- tests 中 mock business data
- README/package metadata 中产品描述

第二步：全仓搜索旧语义：

- 稳
- candidate
- ranking
- leaderboard
- winner
- top-n
- 大夯
- 偏夯
- 胶着
- 偏拉
- 大拉
- LiangScore
- BallotLedger
- LiangBallot
- 梁签
- 小难梁
- 牢梁
- 梁哥
- old personal AvatarTier
- personal growth tier
- earned_incense_today -> avatar
- avatar tier depends on earned
- global ratio does not affect avatar
- vote cannot reduce LiangQi
- distance to next tier
- cacheReadWeight
- cacheReadTokens * 0.1
- Bayesian
- priorHang
- priorLa

不要机械删除无关英文单词，只处理梁标业务语义。

第三步：更新根目录 AGENTS.md，冻结以下合同：

PRODUCT:
- 产品名：梁标
- 梁文锋统一称为“梁子”
- Hover/Focus：今日梁位
- 展开标题：今日梁案
- 一天原则上只有一个 Active 梁案
- 投票只有 up/down
- UI 文案是“夯/拉”
- 无第三选项
- 无 ranking/leaderboard/winner

UI:
- 四个视觉区域：
  1. 今日梁案
  2. 左夯比例 + 中央梁子 + 个人梁气环 + 右拉比例
  3. 夯/拉两个投票按钮
  4. 全局香火 + 香客
- 不再单独设置“个人成长状态”层。
- 中央必须是具象梁子，不得用普通 Gauge 替代。
- 梁气必须与中央梁子视觉叠加，但数据解耦。

GLOBAL LIANGZI STATE:
- total_votes=0 -> WAITING / 待开梁
- up_ratio < 60% -> 梁工
- 60% <= up_ratio < 70% -> 梁总
- 70% <= up_ratio < 80% -> 梁神
- 80% <= up_ratio < 90% -> 梁圣
- up_ratio >= 90% -> 梁祖
- 五态只由全网 up_ratio 驱动。
- WAITING 不是第六 Tier，只是 0 票占位。
- 个人 Token、earned、remaining、LiangQi 不得直接选择梁子状态。

PERSONAL LIANGQI:
- 梁气无个人 Tier。
- remaining_incense 决定梁气“旺盛程度”。
- token_remainder / token_per_incense 决定梁气环 fill。
- tokens_to_next_incense 必须整合在 LiangQi 组件内，不单独增加一整层文案。
- 投票成功后 remaining_incense -1，因此 LiangQi intensity 可降低。
- 投票不改变 token_remainder / ring fill。
- Token 跨过 50K 阈值后 earned/remaining +1，remainder 回绕，播放短暂 +1 炷反馈。

TOKEN:
- LIANG_TOKEN_PER_INCENSE = 50000 默认，可配置。
- Effective Token = Input + Output。
- 若 DSH 将 Input 拆成 uncached/cache-read/cache-write，则三者都属于 Input。
- reasoning 已包含 output 时不得重复计。
- 不使用 Context Occupancy。
- 不使用 cacheRead 10% 旧公式。
- 不 mint 梁签。

PERSONAL ACCOUNTING:
- earned_incense_today = floor(effective_tokens_today / token_per_incense)
- used_incense_today = accepted_up_votes_by_me + accepted_down_votes_by_me
- remaining_incense = earned_incense_today - used_incense_today
- token_remainder = effective_tokens_today % token_per_incense
- liang_qi_fill = token_remainder / token_per_incense
- tokens_to_next_incense = token_per_incense - token_remainder
- remaining_incense >= 0

GLOBAL:
- up_votes
- down_votes
- total_incense = up_votes + down_votes
- unique_voters
- up_ratio/down_ratio
- liangzi_state = policy(up_ratio), zero votes => WAITING
- no global LiangScore
- no Bayesian prior

VOTING:
- 1 successful vote consumes exactly 1 remaining incense.
- 同一用户可以重复投同一方向。
- 同一用户可以先夯后拉。
- up/down 共用一个 remaining_incense 池。
- request_id 必须支持 idempotency。
- 只剩 1 炷时并发多个 vote，最多成功 1 个。

SECURITY:
- 前端 Vote 请求不得声明并让后端信任：
  user_id
  effective_tokens
  earned_incense
  used_incense
  remaining_incense
  liangzi_state
- production backend 必须从可信身份、可信 Token authority 和服务端 vote records 自行计算。
- 如果当前 DSH 没有可供第三方插件使用的可信 Auth/Token authority，不得发明 API，不得把匿名 ID 冒充 Auth；必须标为 P0 open risk。

第四步：

创建或更新：

- docs/PRODUCT_FREEZE_V0.1.md
- docs/SEMANTIC_CORRECTION_01B_R2.md

PRODUCT_FREEZE_V0.1.md 必须覆盖此前个人五态错误语义。

SEMANTIC_CORRECTION_01B_R2.md 记录：
- 找到哪些旧语义
- 修改了哪些
- 是否发现 personal earned -> avatar 逻辑
- 是否发现 global ratio/avatar decoupling 旧测试
- 是否发现 LiangQi 不可下降旧逻辑
- 哪些 generic skeleton 保留

第五步：

只修正已经存在的错误业务 placeholder。
不要：
- 重做 Prompt 01 skeleton
- 接真实 Token
- 接后台
- 实现正式 UI
- 修改 ../deepseek-harness
- 引入新依赖
- 开始 Prompt 02

Acceptance Criteria:

1. Prompt 01 skeleton 仍 build/typecheck/test。
2. AGENTS.md 已切换到“全网五态 + 个人梁气”模型。
3. 代码中无第三选项 / ranking / winner。
4. 不存在个人 earned incense 驱动中央梁子状态的实现。
5. 不存在“global ratio 不得改变 avatar”的旧不变量。
6. 梁气语义是 remaining incense + next-incense token progress。
7. 旧 cache-read 0.1 / 梁签模型不再作为核心逻辑。
8. 不进入下一阶段。

完成后停止并报告：
- files changed
- detected obsolete semantics
- preserved generic skeleton
- test/typecheck/build results
- remaining P0 risks
```

---

# 5. 修订后的执行序列

```text
Prompt 01 已完成
        ↓
Prompt 01B R2 业务语义纠偏
        ↓
Prompt 02 正确 UI（Mock）
        ↓
Prompt 03 纯领域模型 + P0 Tests
        ↓
Prompt 04 DSH Authority / Token / Auth Spike（文档门）
        ↓
      Decision Gate A
        ↓
Prompt 05 真实 DSH Input+Output Token → Personal LiangQi
        ↓
Prompt 06 本地 Authoritative Fake Service 完整闭环
        ↓
      Codex Review A
        ↓
Prompt 07 服务端 Authority + DB 设计
        ↓
Prompt 08 在线 Vote Backend
        ↓
Prompt 09 DSH Host ↔ Backend 集成
        ↓
      Codex Review B
        ↓
Prompt 10 安全/并发/时间边界/兼容加固
        ↓
Prompt 11 Release Candidate
        ↓
      Codex Final Review
```

并行审查：

```text
Prompt 04 期间：DSH Self-check A
Prompt 05 后：DSH Self-check B
Prompt 06 后：Codex Review A
Prompt 09 后：Codex Review B
Prompt 11 后：Codex Final Review
```

---
# 6. Prompt 02：正确 UI + Mock State

> Cursor 新 Chat。Plan → Agent。

```text
基于已经完成的 Prompt 01B R2，在当前可运行的 dsh-liangbiao skeleton 上实现“梁标 V0.1 正确 UI”。

本阶段只做：
- DSH WebUI UI
- component structure
- mock state
- interaction shell
- accessibility
- responsive/theme behavior

本阶段绝对不做：
- 真实 Token
- 真实 Auth
- 真实 Backend
- DB
- Candidate/Ranking
- 第三个投票选项

先读取：
- AGENTS.md
- docs/PRODUCT_FREEZE_V0.1.md
- docs/SEMANTIC_CORRECTION_01B_R2.md
- Prompt 00/01 留下的 DSH Slot/Client conventions docs
- 当前 ../deepseek-harness 对应 UI Slot 和 theme conventions

不要凭记忆猜 DSH API。

## 入口

产品名：梁标

DSH WebUI 中显示一个全局悬浮/停靠式入口。

Hover 和 keyboard focus tooltip 必须精确为：

`今日梁位`

点击打开紧凑面板。
Escape / click outside 关闭。
入口继续使用已经验证的 DSH UI Slot，不得 DOM monkey patch。

## 面板四个视觉区域

### Region 1 — 今日梁案

标题：
`今日梁案`

mock 梁案：
`DeepSeek Harness 是夯还是拉`

不要多候选列表，不要 Tab，不要 leaderboard。

### Region 2 — 核心视觉

必须实现：

`夯 83%    [中央梁子：梁圣 + 个人梁气环]    拉 17%`

要求：

- 左侧是全局夯比例
- 中央梁子视觉权重最大
- 右侧是全局拉比例
- 中央不是 Gauge / Donut / Meter
- 中央必须有 `LiangAvatar` abstraction
- 本阶段可用原创 SVG/CSS placeholder，不使用第三方未授权人物素材
- placeholder 要明显表现不同状态，不只是换文字

建立：

`LiangziState`

状态：
- WAITING / 待开梁
- LIANG_GONG / 梁工
- LIANG_ZONG / 梁总
- LIANG_SHEN / 梁神
- LIANG_SHENG / 梁圣
- LIANG_ZU / 梁祖

mock global state：

- upVotes = 10665
- downVotes = 2181
- totalIncense = 12846
- upRatio ~= 83%
- downRatio ~= 17%
- liangziState = 梁圣

状态规则必须在 mock domain helper 中实现，而不是手写“83% => 梁圣”在组件里：

- 0 votes => WAITING / 待开梁
- <60% => 梁工
- 60–<70 => 梁总
- 70–<80 => 梁神
- 80–<90 => 梁圣
- >=90 => 梁祖

### 梁气必须围绕梁子，但只属于当前用户

使用一个 `LiangQi` / `LiangQiRing` abstraction。

mock personal state 采用：

- effectiveTokensToday = 397000
- tokenPerIncense = 50000
- earnedIncenseToday = 7
- usedIncenseToday = 2
- remainingIncense = 5
- tokenRemainder = 47000
- tokensToNextIncense = 3000
- liangQiFill = 94%

视觉语义：

- `remainingIncense = 5` 决定梁气旺盛程度
- `liangQiFill = 94%` 决定环从空到满的 fill
- “5 炷”和“再 3,000 Token”必须直接整合进梁气环，不额外做一整行个人成长文案
- 不显示“距梁圣还差几炷”
- 不存在个人梁哥/梁祖成长

建议紧凑视觉：

梁气环中心/环边：
- `5 炷`
- `再 3,000 Token`

这两个信息属于同一组件。

### Region 3 — 投票按钮

只有两个：

左：`夯！`
右：`拉！`

可以根据整体 tone 后续决定是否使用“升梁/降梁”附属小字，但 V0.1 主文案优先保持极简。

点击 mock vote 后：

1. `remainingIncense -1`
2. `usedIncense +1`
3. 对应 mock global up/down +1
4. 重新计算 global ratio
5. 重新计算 `liangziState = f(global upRatio)`
6. `tokenRemainder / liangQiFill / tokensToNextIncense` 不变
7. 梁气旺盛程度随 remaining incense 变弱
8. 如果 global ratio 恰好跨状态阈值，中央梁子允许切换状态

非常重要：

- 梁子状态变化是因为全局 ratio 变化，不是因为个人 remaining 变化
- 投票扣香后 LiangQi intensity 可以下降
- 投票不能让下一炷 token ring fill 倒退

`remainingIncense = 0` 后两个按钮 disabled，并提供可访问的 disabled reason。

### Region 4 — 社会化统计

显示：

`🔥 香火 12,846`
`👤 香客 2,841`

香火 = accepted votes 总数。
香客 = unique successful voters。

## Mock state 分离

### GlobalLiangState

- upVotes
- downVotes
- totalIncense
- uniqueVoters
- upRatio
- downRatio
- liangziState
- snapshotAt

### PersonalLiangQiState

- effectiveTokensToday
- earnedIncenseToday
- usedIncenseToday
- remainingIncense
- tokenRemainder
- tokensToNextIncense
- liangQiFill

`liangQiIntensity` 只作为 presentation derived value。

不要创建：
- PersonalAvatarTier
- PersonalGrowthTier
- nextTier
- incenseToNextTier

## Global state UI test/demo

至少提供：

1. 0 votes => 待开梁
2. 59% => 梁工
3. 60% => 梁总
4. 70% => 梁神
5. 80% => 梁圣
6. 90% => 梁祖

验证个人状态不影响这些结果：

- personal remaining=0, global=92% => 梁祖
- personal remaining=100, global=65% => 梁总

## LiangQi UI test/demo

至少提供：

A. remaining=0, fill=0% => 无可投香火，环刚开始积累
B. remaining=0, fill=94% => 无库存但下一炷快满
C. remaining=5, fill=94% => 梁气旺盛 + 环接近满
D. vote once => remaining 5->4，intensity 下降，fill 仍 94%
E. token +3000 => earned +1，remaining +1，fill 94%->0%，播放短暂凝香反馈

## Animation

梁子：
- global snapshot 造成状态跨阈值时播放一次短状态切换
- WAITING -> first active state 可有“开梁”反馈
- reduced-motion 下禁用强动效

梁气：
- intensity 随 remaining incense 平滑变化
- fill 随 token progress 连续变化
- 满一圈时短暂“凝香 / +1 炷”
- 不持续闪烁

Global ratio：
- 轻微数字 transition
- 状态未跨阈值时不要无意义重播 Avatar 动画

## Accessibility

- keyboard focus
- Enter/Space 打开
- Escape 关闭
- aria-label
- tooltip keyboard focus 可触发
- buttons disabled reason
- reduced motion
- contrast
- light/dark theme
- screen reader 可读出“当前梁子状态、夯拉比例、我的剩余香火、距下一炷 Token”

## 禁止词/模型检查

实现后搜索：

- 稳
- candidate
- ranking
- leaderboard
- winner
- topN
- 大夯
- 偏夯
- 胶着
- 偏拉
- 大拉
- 梁哥
- PersonalAvatarTier
- nextTier
- incenseToNextTier

不得作为 V0.1 业务模型存在。

## Verification

必须用当前 DSH WebUI 实际挂载验证：

- 梁标不遮挡 composer
- 不遮挡 navigation
- popover 不溢出
- dark/light 正常
- console 无错误
- plugin unload 后 UI 完全消失

创建：

- docs/020-ui-v0.1-r2.md
- docs/assets/liangbiao-ui-mock-r2.png

不要使用 screenshot 作为正式人物素材。

Acceptance Criteria:

1. UI 是四个视觉区域，不再有独立个人成长层。
2. 中央是具象梁子，不是 Gauge。
3. 只有夯/拉两个按钮。
4. 0 票显示待开梁。
5. 五态只由 global upRatio 决定。
6. 梁气只表达 personal remaining incense + next-incense token progress。
7. 5 炷 / 再 3000 Token 已整合进 LiangQi 组件。
8. 投票会降低梁气 intensity，但不改变 ring fill。
9. global ratio 跨阈值可以改变中央梁子状态。
10. 无 Candidate/Ranking/Winner/Personal Avatar Tier。
11. typecheck/test/UI smoke 全部通过。

完成后停止，不接真实 Token。
```

---

# 7. Prompt 03：纯领域模型 + P0 Tests

> Cursor 新 Chat。Plan → Agent。

```text
在 Prompt 02 UI 正确后，实现梁标 V0.1 的纯 TypeScript domain model。

本阶段禁止：
- React dependency in domain
- DSH dependency in domain
- network
- DB
- real Auth
- localStorage as source of truth

目标是把最终产品语义写成可测试的不变量。

读取：
- AGENTS.md
- docs/PRODUCT_FREEZE_V0.1.md
- docs/020-ui-v0.1-r2.md

## Domain concepts

至少设计：

DailyLiangCase
BusinessDate
VoteType
VoteIntent
VoteResult
GlobalLiangState
LiangziState
LiangziStatePolicy
PersonalLiangQiState
TokenUsageInput
EffectiveTokenPolicy
IncenseAccountingPolicy
LiangQiProgress
RequestId

不要创建：

Candidate
Ranking
Winner
Leaderboard
LiangScore
BallotLedger
LiangBallot
PersonalAvatarTier
PersonalGrowthTier
NextAvatarTier

## DailyLiangCase

至少：

id
businessDate
title
status
createdAt

status：
- scheduled
- active
- closed

V0.1 同一 business date 原则上只能一个 active case。
真正 DB uniqueness 留给 backend。

## Token policy

默认：

tokenPerIncense = 50000

产品定义：

effectiveToken = inputToken + outputToken

Domain 接受标准化：

{
  inputTokens,
  outputTokens
}

不要在 domain 中绑定 DSH bucket 名称。
DSH bucket mapping 放 compat adapter。

规则：
- input >= 0
- output >= 0
- finite
- integer/safely normalized
- reasoning 不作为独立额外输入

## Incense accounting

定义：

effectiveTokensToday = input + output

earnedIncenseToday = floor(effectiveTokensToday / tokenPerIncense)

usedIncenseToday = acceptedUpVotesByMe + acceptedDownVotesByMe

remainingIncense = earnedIncenseToday - usedIncenseToday

约束：
- used >= 0
- used <= earned
- remaining >= 0
- up/down 共用一个 spendable pool

## LiangQi progress

定义：

tokenRemainder = effectiveTokensToday % tokenPerIncense

liangQiFill = tokenRemainder / tokenPerIncense

tokensToNextIncense = tokenPerIncense - tokenRemainder

当 remainder=0：
- fill=0
- tokensToNext=tokenPerIncense

不要把 `remainingIncense` 混进 fill 计算。
不要把 token progress 混进 LiangziState。

`liangQiIntensity` 属于 presentation policy，不是核心 domain tier。
如需要共享 helper，只允许从 remainingIncense 派生连续 visual scalar，不允许生成命名等级。

## Global vote / Liangzi state

Global 处理：

upVotes
downVotes
totalIncense = upVotes + downVotes

0 votes：
- upRatio = null
- downRatio = null
- LiangziState = WAITING

有票：

upRatio = upVotes / totalIncense
downRatio = downVotes / totalIncense

LiangziStatePolicy：

- upRatio < 0.60 => LIANG_GONG
- 0.60 <= upRatio < 0.70 => LIANG_ZONG
- 0.70 <= upRatio < 0.80 => LIANG_SHEN
- 0.80 <= upRatio < 0.90 => LIANG_SHENG
- upRatio >= 0.90 => LIANG_ZU

阈值必须 policy 配置化并验证：
- 单调
- 0..1 范围
- 无重叠
- 无 gap
- WAITING 独立由 totalVotes=0 处理

不要 Bayesian prior。
不要 global score。

## Vote rules

一个成功 vote：
- 消耗 1 remaining incense
- 只增加 up/down 之一
- 对全局比例产生贡献

允许：
- 重复 up
- 重复 down
- up 后 down

不实现：
- 一人一票
- 一方向一次
- cooldown
- vote weight

## P0 Test Matrix

### Token boundary

tokenPerIncense = 50000：

0       -> earned 0, remainder 0, fill 0%, toNext 50000
49,999  -> earned 0, remainder 49999, fill 99.998%, toNext 1
50,000  -> earned 1, remainder 0, fill 0%, toNext 50000
99,999  -> earned 1, remainder 49999, toNext 1
100,000 -> earned 2, remainder 0
500,000 -> earned 10
1,000,000 -> earned 20

### Personal inventory

earned=7
used=2
remaining=5

成功 vote：
used=3
remaining=4

但 tokenRemainder / fill / toNext 不变。

### Repeated vote

earned=5
used=0

连续 up 5 次全部允许。
第 6 次 insufficient_incense。

### Mixed vote

3 炷：
up
down
up

均合法。
used=3。

### Liangzi state thresholds

0 votes -> WAITING

有票时：
- 0% -> 梁工
- 59.999% -> 梁工
- 60% -> 梁总
- 69.999% -> 梁总
- 70% -> 梁神
- 79.999% -> 梁神
- 80% -> 梁圣
- 89.999% -> 梁圣
- 90% -> 梁祖
- 100% -> 梁祖

### Personal/global independence

Case A:
personal remaining=0
global upRatio=92%
=> 梁祖

Case B:
personal remaining=100
global upRatio=65%
=> 梁总

Case C:
personal effectiveTokens 增长但 global votes 不变
=> LiangziState 不变

### Vote can indirectly change Liangzi state through global ratio

构造一个 threshold-crossing case：

例如某个 accepted UP vote 使 upRatio 从 <80% 变为 >=80%。
验证：
- personal remaining -1
- token fill 不变
- global ratio 重算
- LiangziState 梁神 -> 梁圣

状态变化原因必须是 global ratio，而不是 remaining incense。

### Zero votes

up=0
down=0
=> ratios null
=> WAITING

不要 50/50。

### Invalid

negative
NaN
Infinity
overflow
invalid thresholds
used > earned
invalid vote type

全部 fail safe。

## Serialization

所有跨 Host/Client/Backend contract：
- schema version
- runtime validation
- discriminated errors

创建：

- docs/030-domain-model-v0.1-r2.md
- docs/031-domain-invariants-r2.md
- docs/032-p0-test-matrix-r2.md

Acceptance Criteria:

1. Domain 无 React/DSH/network。
2. 50K=1 incense 边界测试精确通过。
3. remaining = earned-used。
4. LiangQi fill 只来自 token remainder。
5. 梁子 WAITING/五态只来自 global vote ratio。
6. 个人 incense 不直接选择梁子状态。
7. accepted vote 可通过改变 global ratio 间接改变梁子状态。
8. 无 PersonalAvatarTier / global LiangScore / Bayesian / 梁签。
9. P0 tests 全部通过。
10. typecheck/test 通过。

完成后停止。
```

---

# 8. Prompt 04：DSH Auth / Token Authority / Integration Spike

> Online Voting 的 P0 技术门。Cursor 新 Chat，Plan Mode，先只读勘察。

```text
现在进入梁标 V0.1 的 DSH Authority Spike。

本阶段主要目标不是写代码，而是回答：

“生产环境 Backend 如何在不相信前端自报 Token/余额的前提下，获得可信用户身份和可信 DSH Token 使用量，从而自行判断 remaining_incense？”

产品语义先冻结：
- 中央梁子 WAITING/五态由全网 up_ratio 决定
- 个人 Token 不驱动中央梁子状态
- 个人 remaining incense 决定梁气旺盛程度
- token remainder 决定梁气环 fill
- 50K Input+Output Token = 1 earned incense
- 1 accepted vote = 1 used incense

严格遵守：
- AGENTS.md
- docs/PRODUCT_FREEZE_V0.1.md
- 当前本地 ../deepseek-harness
- 不凭训练记忆猜 DSH API
- 不把 anonymous id 冒充 Auth

## A. Current User / Auth

搜索当前 DSH：
- identity/*
- auth/*
- API/BFF
- Web UI bootstrap
- provider credential
- anonymous-user-id
- telemetry
- DeepSeek request headers
- remote RPC identity
- current user services

明确回答：
1. DSH 是否存在“已认证用户”概念？
2. 是否有第三方插件可读取的 current user / user id？
3. 该 identity 是否可被外部 Liangbiao Backend 验证，而不仅是客户端自己声明？
4. anonymous-user-id 的安全语义是什么？
5. anonymous id 是否可删除/重置？
6. 是否只能作为 pseudonymous identifier，而不能作为 Auth？
7. DeepSeek provider 是否向远端发送某个 harness user id header？
8. 梁标 Backend 是否有合法手段验证该 header 的真实性？

每个结论附：
- source file
- symbol
- public/internal
- trust level

## B. Token Source

当前产品要求：

Effective Token = Input + Output

确认 DSH provider-reported usage bucket：
- uncachedInputTokens
- cacheReadTokens
- cacheWriteTokens
- outputTokens

确认 V0.1 mapping 是否应为：

inputTokens = uncachedInputTokens + cacheReadTokens + cacheWriteTokens

effectiveTokens = inputTokens + outputTokens

确认：
- buckets 是否互斥
- reasoning 是否包含在 output
- usage chunk/final replacement
- durable projection replay semantics
- multi-session aggregation方式
- day boundary 能否可靠过滤
- 是否有 whole-user / whole-profile token aggregate service
- 是否只有 per-session projections

## C. Server-verifiable Token Authority

重点搜索：
- remote usage API
- authenticated usage ledger
- signed usage receipt
- signed request accounting
- API key usage query
- server endpoint 可按 harness user id 查询 Token
- plugin backend 能验证 Token 的机制

不要因为本地 Host 能读 tokenUsage，就说“服务端可信”。

建立 trust table：

Source | readable by Host | readable by Browser | verifiable by Liangbiao Backend | user-modifiable | suitable for production vote authority

至少列：
- browser state
- Host local projection
- session log
- anonymous-user-id
- DeepSeek provider response usage
- any remote API found

## D. DSH Backend/API conventions

搜索：
- Host RPC
- BFF
- API Proxy
- persistence
- sqlite transaction examples
- idempotency patterns
- current service registration patterns

回答：
- 梁标 Host 与 Client 推荐怎样通信？
- 如果梁标需要本地 state，推荐存哪里？
- 如果梁标 Backend 与 DSH Host 通信，推荐怎样发 HTTP？
- 是否有现有 auth token forwarding pattern？
- 是否有 user-facing toast/dialog/theme primitives？
- 当前最适合梁标的 UI Slot 是否仍与 Prompt 00 一致？

## E. Business date / timezone

- 不使用 Browser local date 作为唯一 authority。
- backend 必须返回 business_date。
- business timezone 必须显式配置。
- day rollover 必须由 server authoritative clock 决定。

检查 DSH 是否有现成 timezone/user setting。
若没有，梁标 Backend 自己管理。

## F. Decision Gate A

### A1 — Fully verifiable

存在：
- 可验证 DSH user identity
- 可验证 server-side token usage

则给出生产架构。

### A2 — Identity verifiable, Token not verifiable

说明：
- 哪部分可信
- 哪部分不能满足冻结安全原则
- 不得用客户端 token 自报替代

### A3 — Token observable locally, identity/authority not verifiable

明确：
- local Host projection 只适合 UX / dev
- 不满足 production authority

### A4 — No suitable authority

停止在线 Vote Backend 的生产实现，并给出最小技术选项，不替用户做产品决策：
- DSH upstream 增加 signed usage/identity capability
- 梁标引入独立账号与服务器可验证模型 usage
- 用户明确接受 soft-trust community mode
- 仅发布本地 demo，不开放可信全网投票

禁止：
- 偷偷降级为 soft trust
- anonymous id 当 auth
- browser/Host 自报 effective_tokens 当 backend authority
- 私钥也在客户端的伪签名

## Deliverables

- docs/040-dsh-authority-spike.md
- docs/041-dsh-token-mapping.md
- docs/042-auth-trust-model.md
- docs/043-decision-gate-a.md
- docs/044-dsh-current-ui-backend-conventions.md

只在必要时做最小 proof-of-concept。
不要实现正式 backend。
不要实现 Vote API。
不要修改 DSH core。

Acceptance Criteria:

1. Current User/Auth 结论有源码证据。
2. anonymous identity 与 Auth 明确区分。
3. Input+Output mapping 有源码证据。
4. 本地 token projection 与 server-verifiable token authority 明确区分。
5. business date authority 已定义。
6. Decision Gate A 明确落在 A1/A2/A3/A4。
7. 没有假设不存在的 DSH API。
8. 没有为了继续开发而弱化安全原则。

完成后停止。
```

---

# 9. DSH Self-check A：与 Prompt 04 并行

```text
请作为当前运行版本 DeepSeek Harness 的框架专家，对“梁标 V0.1”的身份、Token 与扩展接口进行独立只读审查。

本审查与 Cursor 源码勘察并行。
不要依赖 Cursor 的任何结论。
所有判断只基于当前 DSH runtime 和当前源码。

梁标产品约束：

- 今日只有一个 Active 二元梁案
- 只有“夯 / 拉”
- Input + Output Token 每 50K 获得 1 炷香
- 一炷香 = 一次 Vote
- 中央“梁子”状态由全网 up_ratio 决定：
  0票待开梁；<60 梁工；60–70 梁总；70–80 梁神；80–90 梁圣；>=90 梁祖
- 个人 remaining incense 决定梁气旺盛程度
- 距下一炷的 Token progress 决定梁气环 fill
- production backend 不允许相信前端自报 user_id/token/incense

请重点回答：

1. 当前 DSH 是否存在可供第三方插件读取的 authenticated current user？
2. 当前 DSH 的 anonymous-user-id 是 Auth、匿名标识，还是其他语义？
3. 该 ID 是否可重置？
4. 外部 Liangbiao Backend 能否验证某请求确实来自该 DSH identity？
5. 当前 DSH 是否存在 server-side / remote Token ledger 可供第三方 Backend 查询？
6. 当前 provider-reported Token usage 的权威接口是什么？
7. tokenUsage 的四 bucket 是否互斥？
8. 为实现 Input+Output，是否应：uncachedInput + cacheRead + cacheWrite + output？
9. reasoning 是否已经属于 output？
10. usage chunk 与 final usage 如何去重？
11. complete durable log 的 token projection 是否支持 replay/restart？
12. 如何按 business date 对多个 session 做可靠聚合？
13. 是否有 whole-profile token aggregate，还是必须逐 session？
14. Host/Client 通信当前推荐公开接口是什么？
15. 当前全局 UI Slot 推荐哪个？
16. DSH toast/dialog/theme conventions 是什么？
17. 当前 Host HTTP / BFF / RPC 推荐模式是什么？
18. DSH 是否已有 DB transaction / idempotency 可借鉴？
19. developer-preview 下哪些接口不适合 out-of-tree plugin 依赖？

输出：
- Verified facts
- Trust boundary
- Production blockers
- Public APIs
- Internal APIs to avoid
- Minimal recommended integration seam

每个结论附：
- source path
- symbol
- public/internal
- confidence

特别注意：
不要把“Host 本地可以读取”误写成“Liangbiao 云端 Backend 可以可信验证”。
不要建议让前端传 effective_tokens 解决票权问题。
不要修改任何文件。
```

---

# 10. Prompt 04.5：交叉验证 Authority Spike

```text
这是独立运行的 DSH Self-check A 输出。

请将它与你已完成的：
- docs/040-dsh-authority-spike.md
- docs/041-dsh-token-mapping.md
- docs/042-auth-trust-model.md
- docs/043-decision-gate-a.md
- docs/044-dsh-current-ui-backend-conventions.md

逐项交叉验证。

规则：
1. 当前本地 DSH 源码是最终事实来源。
2. 不因为 DSH Agent 声称某 API 可用就直接接受。
3. 对每个一致结论标记 VERIFIED。
4. 对每个冲突结论列出 Cursor 结论 / Self-check 结论 / 源码证据 / 最终判断。
5. 特别核对：
   - anonymous identity vs authenticated user
   - server-verifiable identity
   - server-verifiable token usage
   - Input+Output token mapping
   - reasoning
   - chunk/final replacement
   - multi-session aggregation
   - business date
   - Host/Client communication
   - UI Slot
   - persistence
   - API/BFF conventions
6. 如果源码仍无法消除冲突，标记 OPEN P0 RISK。
7. 不得用 soft-trust 自动覆盖冻结安全要求。

更新对应 docs。
本阶段不写正式 Backend。
完成后停止。
```

---

# 11. Prompt 05：真实 DSH Token → Personal LiangQi

> Decision Gate A 不影响本地 UX 计量开发，但本地值不得自动冒充 production authority。

```text
在 Prompt 04/04.5 完成后，将梁标接入真实 DSH provider-reported Token usage，用于计算当前用户的 PersonalLiangQiState。

本阶段目标：

DSH Input+Output usage
-> effective_tokens_today
-> earned_incense_today
-> token_remainder
-> tokens_to_next_incense
-> liang_qi_fill

注意：
- 本阶段绝不根据个人 Token 切换中央梁子状态。
- 中央梁子继续由 mock/global snapshot 的 up_ratio 决定。

## DSH source

只使用 docs/041-dsh-token-mapping.md 已验证 seam。

若 DSH tokenUsage 使用：
- uncachedInputTokens
- cacheReadTokens
- cacheWriteTokens
- outputTokens

则标准化：

inputTokens = uncachedInputTokens + cacheReadTokens + cacheWriteTokens

effectiveTokens = inputTokens + outputTokens

不要：
- cacheRead 0.1
- 忽略 cacheWrite
- reasoning double count
- Context Occupancy
- UI scraping

## Daily aggregation

聚合用户今日所有符合 V0.1 规则的 DSH 使用量。

V0.1 不做 TARGET_MODEL filter。

处理：
- multiple sessions
- session replay
- restart
- reconnect
- compaction
- pagination
- new session
- deleted/retired session if current public DSH contract covers it
- usage chunk/final replacement
- duplicate notification

## Business date

本地 UI 尚未连接 backend 时：
- 使用明确 dev business timezone config
- 不散落 new Date().toLocaleDateString()
- 抽象 Clock/BusinessDateProvider

在线后：
- 接受 Backend business_date/server time 为 authority

## State

Host owns local observed usage：

LocalObservedDailyUsage {
  businessDate
  effectiveTokensToday
  inputTokensToday
  outputTokensToday
  observedAt
}

由 domain 派生：

- earnedIncenseToday
- tokenRemainder
- tokensToNextIncense
- liangQiFill

`usedIncenseToday / remainingIncense` 暂时由 mock authoritative service 提供，不能因为本地 observed earned 增长就直接宣称生产可投余额。

## UI

替换 Prompt 02 的 token progress mock：

- 梁气环 fill 来自真实 observed token remainder
- “再 N Token”来自真实 observed token remainder
- 如果 dev mock authoritative balance 与真实 earned 同步，梁气 intensity 可跟随 dev balance
- 中央梁子状态仍只来自 global mock/snapshot

不要增加独立个人成长层。

## Diagnostics

开发模式可显示：
- input tokens
- output tokens
- effective tokens
- earned incense
- token remainder
- tokens to next incense
- ring fill
- business date
- last projection update

不得显示：
- prompt
- response
- file path
- API key
- raw content

## P0 tests

TOKEN_PER_INCENSE=50000：

0 -> earned0, fill0, toNext50000
49,999 -> earned0, toNext1
50,000 -> earned1, fill0, toNext50000
99,999 -> earned1, toNext1
100,000 -> earned2
500,000 -> earned10
1M -> earned20

DSH mapping：

uncached=10k
cacheRead=20k
cacheWrite=5k
output=15k
=> input=35k
=> effective=50k
=> earned=1
=> remainder=0
=> toNext=50k

特殊演示：

effective=397000
=> earned=7
=> remainder=47000
=> toNext=3000
=> ring fill=94%

reasoning 已包含 output：不得额外加。
Replay/restart 不得重复。
Multi-session 当日合计正确。
Day rollover 新日从 0 开始。

## Global isolation tests

个人 Token：
397k -> 447k -> 497k

如果 global up/down 不变：
中央梁子状态必须完全不变。

global ratio 从 79% -> 80%：
即使个人 Token 不变，中央梁子必须梁神 -> 梁圣。

## Deliverables

- docs/050-real-token-liangqi-integration.md
- docs/051-daily-token-aggregation.md
- docs/052-local-vs-authoritative-state.md

Acceptance Criteria:

1. DSH Input+Output mapping 正确。
2. cacheRead/cacheWrite 全部算 Input。
3. reasoning 不重复。
4. replay/restart 不重复。
5. multi-session day total 正确。
6. ring fill / toNext 来自真实 token remainder。
7. 个人 Token 不改变中央梁子状态。
8. local observed 与 production authority 类型/docs 明确分离。
9. typecheck/test/real DSH smoke 通过。

完成后停止。
```

---

# 12. DSH Self-check B：真实 Token 集成审查

```text
请只读审查当前 dsh-liangbiao 的 DSH Token 集成。

产品定义：

Effective Token = Input + Output
50,000 Effective Token = 1 earned incense

Personal LiangQi：
- remaining incense 决定旺盛程度
- effectiveTokens % 50K 决定 ring fill
- tokensToNext = 50K - remainder

Global Liangzi：
- 0票待开梁
- <60 梁工
- 60–70 梁总
- 70–80 梁神
- 80–90 梁圣
- >=90 梁祖
- 只由 global up_ratio 决定

重点检查：
1. 是否错误使用 Context Occupancy。
2. 是否把 cacheRead 只算 10%。
3. 是否漏掉 cacheWrite。
4. 是否重复 reasoning。
5. usage chunk/final 是否重复。
6. replay 是否重复。
7. DSH restart 是否重复。
8. compaction 是否重复或丢失 billing。
9. multiple sessions 是否完整。
10. business date 切换是否安全。
11. 是否误把本地 token projection 声称为 server-verifiable authority。
12. 是否上传 prompt/response/raw session。
13. 是否依赖 private DSH API。
14. 是否存在更稳定公开接口。
15. 是否错误用个人 token/earned/remaining 驱动 LiangziState。
16. 是否正确实现 token remainder / toNext / fill。

每个问题输出：
- finding
- severity
- source path/line
- DSH source evidence
- recommended fix
- test to add

不要修改文件。
```

---

# 13. Prompt 06：本地完整闭环（Fake Authoritative Service）

```text
在真实 PersonalLiangQi token progress 已经工作后，完成梁标 V0.1 的本地完整体验。

关键原则：

构建 `FakeAuthoritativeLiangService` 模拟未来服务端。
它只放在 dev/test adapter，不得包装成 production Auth。

## Fake authoritative state

服务维护：
- DailyLiangCase
- authoritative PersonalLiangQi accounting state
- GlobalLiangState raw aggregate
- global snapshot
- vote request idempotency store

它可接收本地 observed effective token 仅用于测试模拟。
生产接口以后不得接受客户端 effective_tokens。

## UI full loop

1. 今日梁案：
   DeepSeek Harness 是夯还是拉

2. 真实 DSH Token：
   -> token remainder
   -> LiangQi ring fill
   -> tokens to next incense

3. Fake authoritative service 同步 earned incense，并维护 used/remaining。

4. 中央梁子：
   -> 只读取 global snapshot up/down ratio
   -> 0票待开梁
   -> ratio 映射梁工/梁总/梁神/梁圣/梁祖

5. 梁气：
   -> remaining incense 决定旺盛程度
   -> token remainder 决定 ring fill
   -> “N炷 / 再X Token”整合在环内

6. 用户点击夯/拉。

7. 每个 accepted vote：
   - used_incense +1
   - remaining_incense -1
   - up/down raw vote +1
   - total_incense +1
   - first accepted vote for user => unique_voters +1

8. accepted vote 后：
   - LiangQi intensity 立即随 remaining 下降
   - token remainder / fill 不变
   - global raw stats 更新
   - public snapshot 按 cadence 更新
   - 中央梁子只在 snapshot up_ratio 变化并跨阈值时切换

## Concurrency

Case：

earned=1
used=0
remaining=1

同时提交 10 个不同 request_id：最多 1 accepted。

## Idempotency

相同 request_id：
- duplicate same payload => same response
- no extra spend
- no extra global vote
- no extra unique voter

same request_id + different vote_type => conflict

## Repeated voting

5 炷允许：
up/up/up/up/up

第六次 rejected。

也允许：
up/down/up/down/up

## Global ratio + Liangzi state

只从 accepted votes 计算 raw global stats。

public snapshot：
- upVotes
- downVotes
- totalIncense
- uniqueVoters
- upRatio
- downRatio
- liangziState
- capturedAt
- sequence

0 vote snapshot：
- ratios null
- liangziState WAITING

阈值：
- <60 梁工
- 60–<70 梁总
- 70–<80 梁神
- 80–<90 梁圣
- >=90 梁祖

必须提供 threshold-crossing test，证明 snapshot 从 79.x% 到 80% 后：
梁神 -> 梁圣。

## Snapshot behavior

保留低频平滑更新：

- raw aggregate 每票事务更新
- public snapshot 可默认 5min cadence，测试用 fake clock 加速
- accepted vote 后 personal remaining 立即更新
- UI 不需要即时伪造新的全网比例
- 中央 LiangziState 与左右 ratio 必须来自同一 snapshot，不能一个新一个旧

区分：
- personal spend response：立即
- global social snapshot + LiangziState：低频

## UI test cases

A. zero votes
=> 待开梁

B. global 59%
=> 梁工

C. global 65%
=> 梁总

D. global 75%
=> 梁神

E. global 85%
=> 梁圣

F. global 92%
=> 梁祖

G. personal remaining=5, fill=94%
=> 梁气旺盛，环接近满

H. 投一票
=> remaining 5->4
=> LiangQi intensity 下降
=> fill 仍94%

I. 再获得3000 Token
=> earned +1
=> remaining +1
=> fill 94%->0
=> +1炷短反馈

J. personal remaining=0, global=92%
=> 中央仍梁祖
=> 梁气库存为0

K. personal remaining=100, global=65%
=> 中央仍梁总
=> 梁气很旺

L. multiple tabs, remaining=1
=> 最多一个成功

## Deliverables

- docs/060-local-full-loop-r2.md
- docs/061-vote-state-machine-r2.md
- docs/062-concurrency-idempotency-r2.md
- docs/063-global-liangzi-state-r2.md
- docs/assets/liangbiao-local-full-loop-r2.png

Acceptance Criteria:

1. 真实 DSH Token 能驱动个人 LiangQi ring progress。
2. Fake service 能提供个人 remaining incense。
3. 1 vote = 1 incense。
4. 可重复同方向投票。
5. 并发超投被阻止。
6. 幂等正确。
7. 香客只在首次成功投票时 +1。
8. 投票降低 LiangQi intensity，不改变 ring fill。
9. 中央梁子只由 global snapshot ratio 决定。
10. 0票待开梁。
11. threshold crossing 能正确切五态。
12. multiple tabs 不双花。
13. 无 Candidate/Ranking/Winner/Personal Avatar Tier。
14. typecheck/test/e2e 全部通过。

完成后停止。
```

---
# 14. Codex Review A：领域与本地闭环

```text
Perform a read-only review of the current `dsh-liangbiao` branch.

Do not edit files.

Frozen product contract:

- one daily binary case
- only UP(夯) and DOWN(拉)
- no third option / ranking / winner
- 50,000 Input+Output tokens = 1 earned incense
- one accepted vote consumes exactly one incense
- UP/DOWN share the same personal incense pool
- central Liangzi state is GLOBAL, not personal
- zero accepted votes => WAITING / 待开梁
- global up ratio thresholds:
  <60 梁工
  60–<70 梁总
  70–<80 梁神
  80–<90 梁圣
  >=90 梁祖
- personal remaining incense controls LiangQi intensity
- personal token remainder controls LiangQi ring fill
- spending incense may reduce LiangQi intensity
- spending incense must not change token remainder/ring fill
- personal token/remaining must never directly select Liangzi state
- an accepted vote may indirectly change Liangzi state only by changing global ratio/snapshot

Review priorities:

1. Input+Output token accounting.
2. DSH bucket mapping.
3. Replay/restart double counting.
4. Daily boundary.
5. earned/used/remaining invariants.
6. token remainder / tokensToNext / ring fill.
7. UP/DOWN shared incense pool.
8. GlobalLiangState / PersonalLiangQiState separation.
9. zero-vote WAITING state.
10. exact 60/70/80/90 threshold boundaries.
11. repeated same-direction voting.
12. mixed-direction voting.
13. concurrent overspend.
14. idempotent request_id.
15. multiple tabs.
16. unique voter counting.
17. global ratio correctness.
18. Liangzi state derived from the same global snapshot as the displayed ratio.
19. no personal token/remaining direct dependency in Liangzi state.
20. vote spend changes LiangQi intensity but not fill.
21. no hidden third option.
22. no Candidate/Ranking/Winner model.
23. React lifecycle/resource cleanup.

Search stale concepts:

- 稳
- candidate
- ranking
- leaderboard
- winner
- LiangScore
- BallotLedger
- 梁签
- 小难梁
- 牢梁
- 梁哥
- PersonalAvatarTier
- nextTier
- incenseToNextTier
- avatar tier depends on earned
- global ratio does not affect avatar
- vote cannot reduce LiangQi
- cacheReadWeight 0.1
- Bayesian prior

Output only:
- Blocker
- High
- Medium
- Low
- Accepted limitation

Every finding:
- file/line
- failure scenario
- violated invariant
- minimal fix
- missing test

Do not modify files.
```

---

# 15. Prompt 07：服务端 Authority + DB 设计

> 只有 Prompt 04 Decision Gate A 已明确后执行。

```text
设计梁标 V0.1 production backend。

本阶段先完成 architecture + schema + transaction proof，不急着写全部 HTTP handlers。

读取：
- docs/043-decision-gate-a.md
- docs/042-auth-trust-model.md
- docs/PRODUCT_FREEZE_V0.1.md
- docs/062-concurrency-idempotency-r2.md
- docs/063-global-liangzi-state-r2.md

硬原则：

production backend 不允许相信客户端传来的：
- user_id
- effective_tokens
- earned_incense
- used_incense
- remaining_incense
- liangzi_state

Vote request 业务 payload 只包含最小必要字段，例如：
- case_id
- vote_type
- request_id

用户身份来自 Prompt 04 已验证的 server-verifiable identity seam。
Token 使用量来自 Prompt 04 已验证的 server-verifiable token authority seam。

如果 Decision Gate A 明确当前 DSH 做不到 server-verifiable token authority：
- 不得偷偷实现 soft trust production
- 不得继续假装 backend authoritative
- 只允许设计接口/DB，并把 production vote endpoint 标为 blocked
- dev/staging adapter 继续使用 FakeAuthoritativeLiangService
- 向用户报告 P0 blocker

## Business date

Backend authority：
- server_time
- business_timezone
- business_date

business timezone 显式配置。
同一 business_date 最多一个 Active DailyLiangCase。
浏览器不决定“今天”。

## Minimal tables/entities

### DailyLiangCase

id
business_date
title
status
created_at
opened_at
closed_at

可选 case policy：
- token_per_incense
- liangzi_threshold_policy_version

### LiangVote

id
case_id
user_id (server-derived)
vote_type // up | down
request_id
created_at

Constraints：
- unique(user_id, request_id) 或等价 idempotency key
- request_id 冲突 payload 可检测

### UserDailyLiangState

user_id
business_date
authoritative_effective_tokens
used_incense
updated_at
version

派生：
- earned_incense
- remaining_incense
- token_remainder
- tokens_to_next_incense
- liang_qi_fill

不得存/派生个人 Avatar Tier。

### DailyLiangStats

case_id
up_votes
down_votes
total_incense
unique_voters
updated_at
version

派生：
- up_ratio
- down_ratio
- liangzi_state

### PublicLiangSnapshot（可物化或缓存）

case_id
up_votes
down_votes
total_incense
unique_voters
up_ratio
down_ratio
liangzi_state
captured_at
sequence
policy_version

必须保证 ratio 和 liangzi_state 来自同一 snapshot/version。

## Source of truth

服务端个人状态：

earned = floor(authoritative_effective_tokens / token_per_incense)
remaining = earned - used
remainder = authoritative_effective_tokens % token_per_incense
fill = remainder / token_per_incense
toNext = token_per_incense - remainder

服务端全局状态：

total = up_votes + down_votes

if total == 0:
  ratio = null/null
  liangzi_state = WAITING
else:
  ratio = raw vote ratio
  liangzi_state = thresholdPolicy(up_ratio)

客户端不得自报这些结果作为 authority。

## Vote transaction

对 authenticated user + active case：

1. 校验 case active 且 business date 当前。
2. 根据 authoritative token source 刷新/读取 effective token。
3. 计算 earned / remaining。
4. 锁定或 CAS UserDailyLiangState。
5. 检查 request_id 是否已处理。
6. duplicate same payload -> 返回原结果。
7. duplicate conflicting payload -> 拒绝。
8. 检查 used < earned。
9. insert LiangVote。
10. used_incense += 1。
11. up/down 对应 +1。
12. total_incense +=1。
13. user 首次成功 vote -> unique_voters +=1。
14. commit。
15. 返回 authoritative personal state。

要求证明：
remaining=1 并发 100 个不同请求，最多 1 accepted。

## Global ratio / Liangzi state

raw aggregate 在 vote transaction 中更新。

public snapshot 可低频生成：
- 先读取一致性 raw aggregate
- 计算 ratios
- 计算 LiangziState
- 一次性发布同一 sequence snapshot

禁止出现：
- UI 显示 79% 但 state 已是梁圣
- UI 显示 83% 但 state 仍梁神

即 ratio 与 state 不能来自不同 snapshot version。

## Snapshot cadence

继续保持低频全局视觉刷新：
- transaction 更新 raw aggregate
- public snapshot 每几分钟生成
- plugin poll snapshot
- 不需要 websocket per-vote broadcast

personal spend response 立即返回。
global ratio/LiangziState 允许等下一 snapshot。

## Token policy

V0.1：

token_per_incense=50000

由 server config/case policy 控制，client 只读。

Liangzi threshold policy 默认：
- <0.60 工
- <0.70 总
- <0.80 神
- <0.90 圣
- else 祖

阈值配置必须版本化，避免 client/server drift。

## Trust boundary

画 data-flow：

DSH trusted identity/token authority
-> Liangbiao Backend
-> DB transaction
-> authoritative PersonalLiangQiState

DB accepted vote aggregate
-> snapshot builder
-> GlobalLiangState
-> ratio + LiangziState

Client：
只提交 vote intent。

如果实际 DSH authority 不满足链路，图上必须画 BLOCKED。

## Deliverables

- docs/070-backend-architecture-r2.md
- docs/071-database-schema-r2.md
- docs/072-vote-transaction-r2.md
- docs/073-business-date.md
- docs/074-authority-data-flow-r2.md
- docs/075-backend-decision.md
- docs/076-global-snapshot-liangzi-policy.md

写 transaction-level prototype tests。

Acceptance Criteria:

1. DB 不存在 Candidate/Ranking 表。
2. Vote 只有 up/down。
3. user_id server-derived。
4. effective token server-derived。
5. remaining server-derived。
6. one vote consumes one incense。
7. concurrent overspend proof/test 通过。
8. idempotency proof/test 通过。
9. unique voters 正确。
10. business date authoritative。
11. Personal state 不含个人 Avatar Tier。
12. Global snapshot 同时拥有一致的 ratio + LiangziState。
13. 0 votes => WAITING。
14. exact 60/70/80/90 boundaries 正确。
15. 若 authority 不可实现，production endpoint 明确 blocked。

完成后停止。
```

---

# 16. Prompt 08：Online Vote Backend

> 若 Decision Gate A 不允许生产可信票权，本 Prompt 仅实现 staging adapter，不得伪装 production。

```text
根据 Prompt 07 已冻结 backend architecture，实现梁标 V0.1 Vote Backend。

第一步读取 docs/075-backend-decision.md。

如果 production authority = BLOCKED：
- 不实现可公开生产使用的“可信票权” endpoint
- 可以实现 staging/dev backend
- runtime 必须明确标记 DEV_SOFT_AUTHORITY 或 STAGING
- production build 默认禁止开启
- README 说明原因
- 不把 staging 方案称为 secure/verified

如果 authority VERIFIED：按已验证 seam 实现。

## API contract

GET /v1/bootstrap

返回：
- server_time
- business_date
- business_timezone
- active_case
- token_policy
- liangzi_policy/version
- authoritative_personal_liangqi_state
- global_snapshot
- snapshot_refresh_seconds

POST /v1/votes

request body 只接受：
- case_id
- vote_type
- request_id

不要接受：
- user_id
- effective_tokens
- earned_incense
- used_incense
- remaining_incense
- liangzi_state

身份从 auth context 获取。

response：
- vote result
- authoritative personal LiangQi state
- accepted request id
- current global snapshot version/capturedAt
- 不需要即时返回新全网比例

GET /v1/snapshot

返回 GlobalLiangState snapshot：
- up/down counts
- total incense
- unique voters
- ratios
- LiangziState
- capturedAt
- sequence
- policyVersion

可选 GET /v1/me/daily-state：
只返回 authoritative personal LiangQi/accounting state。

## Vote types

enum：UP / DOWN
JSON："up" / "down"
UI：夯 / 拉

拒绝：steady / neutral / abstain / third-option。

## Transaction

严格使用 Prompt 07 transaction。

P0：remaining=1，100 concurrent different request_id，accepted <=1。

## Idempotency

same user + same request_id + same payload -> same result
same user + same request_id + different payload -> structured conflict

## Participant counting

第一次 accepted vote：unique_voters +1
后续不再 +1。
方向变化也不再增加。

## Personal token boundary backend tests

50K：
0
49,999
50,000
99,999
100,000
397,000
500,000
1M

验证 earned / remaining / remainder / fill / toNext 与 domain 一致。

## Global Liangzi policy backend tests

0 votes => WAITING
59.x => 梁工
60 => 梁总
70 => 梁神
80 => 梁圣
90 => 梁祖
100 => 梁祖

snapshot ratio 与 LiangziState 必须来自同一 sequence。

## Time

- server controls business date
- vote close/open 使用 server time
- client clock 不影响 eligibility
- midnight rollover race 有 transaction test
- stale case_id vote 被拒绝

## Security

- auth validation
- schema validation
- body size limit
- rate limit
- timeout
- structured errors
- no raw credentials in logs
- no prompts/model outputs
- no API keys
- no session content
- request_id length/format bound
- vote_type exact enum

## Global snapshot

默认刷新周期配置化，例如 300 秒。
raw DB aggregate 实时更新。
public snapshot 可滞后。

客户端刚投票后：
- personal remaining 立即准确
- LiangQi intensity 可立即变化
- token ring fill 仍依据 personal token state
- global percentage 与中央梁子状态一起等下一 snapshot

## Deliverables

backend/
- docs/080-backend-api-r2.md
- docs/081-backend-security.md
- docs/082-backend-tests-r2.md

Acceptance Criteria:

1. Frontend 无法伪造 remaining 获得票权。
2. Frontend 无法伪造 user_id 换身份。
3. 1 Vote = 1 incense。
4. 同一用户可连续投多次。
5. 并发超投安全。
6. 幂等安全。
7. unique voter 安全。
8. 只有 up/down。
9. business date server-authoritative。
10. global snapshot ratio + LiangziState 一致。
11. 0票待开梁。
12. 无 personal Avatar Tier / ranking / winner。
13. tests 全通过。
14. authority 状态诚实标记。

完成后停止。
```

---

# 17. Prompt 09：DSH Host ↔ Backend 集成

```text
将梁标 DSH plugin 与 Prompt 08 backend 集成。

原则：

- Browser Client 只负责 UI + command。
- DSH Host 负责调用 Liangbiao Backend。
- Backend 是 online authoritative personal spend state。
- Browser 不提交 user_id/token/incense/liangzi_state。
- 中央 LiangziState 只来自 authoritative global snapshot。
- Personal LiangQi online 以 authoritative personal state 为准。

## Bootstrap

Host 启动：

1. 加载 last known cached presentation state。
2. 请求 /v1/bootstrap。
3. 使用 backend server_time/business_date。
4. 获取 active DailyLiangCase。
5. 获取 authoritative personal LiangQi state。
6. 获取 global snapshot。
7. 获取 token policy + Liangzi policy version。
8. 本地 DSH observed token 只用于 diagnostics/reconciliation，不越权增加票权。

## UI state merge

### GlobalLiangState

只能来自 server snapshot：
- up/down
- ratios
- total incense
- unique voters
- LiangziState
- sequence/capturedAt

中央梁子与左右百分比必须来自同一 snapshot。

### PersonalLiangQiState

online production：
- earned/used/remaining 以 backend authoritative 为准
- token remainder/toNext/fill 以 backend authoritative token state 为准（如果 backend authority 返回这些）
- 本地 observed 只用于 debug discrepancy detection

如果 docs/075 决策规定 backend 只能返回部分 token state，则严格按该决策实现，不自行扩大本地信任边界。

## Vote command

Client：vote(up/down)

Host：
- 生成/持有 request_id
- POST /v1/votes
- 不附加 user_id/effective_tokens/remaining/liangzi_state
- pending UI

Backend accepted：
- 更新 authoritative used/remaining
- LiangQi intensity 立即变化
- token ring fill 只根据 authoritative token progress，不因投票变化
- 显示短“已上香”反馈
- 不立即伪造 global ratio / LiangziState

Backend insufficient_incense：
- 刷新 authoritative state
- UI 显示香火不足

Network failure：
- 保留 request_id
- retry same request_id
- 禁止生成新 request_id 绕过不确定结果

## Multiple tabs

Host 统一 authoritative state。
多个 Client tab 不各自维护余额。

测试：
remaining=1
两 tab 同时点不同方向
=> backend 最多一个成功
=> 两 tab 最终 remaining=0

## Snapshot polling

- 默认来自 backend config
- 约 5min 量级
- jitter
- bounded retry
- AbortController
- plugin dispose cleanup
- manual open 可 stale-while-revalidate
- 不做 per-vote WebSocket

新 snapshot 到来时：

1. 原子替换 ratio + LiangziState + stats
2. 若 state 跨阈值，播放一次短 Avatar transition
3. 如果 ratio 变化但 state 未变，只更新数字，不重播强动画

## Day rollover

backend business_date 改变：
- active case 更新
- personal daily token/incense state 更新
- LiangQi 重置到新日状态
- global snapshot 切新 Active case
- 新 case 若 0 votes => 待开梁
- 昨天 vote/token 不进入今天
- stale pending vote 按 backend state machine 处理

浏览器 midnight timer 不作为 authority。

## Discrepancy diagnostics

若 local observed token 与 backend authoritative token 可比较：
只在 dev 模式显示差异。
不要自动相信较大的那个。

## UI P0

- 左夯比例 / 中央梁子 / 右拉比例同 snapshot
- 中央梁子周围叠个人梁气
- 梁气显示 remaining incense + toNext token，整合在环内
- 投票后 intensity 可立即变弱
- ring fill 不因投票下降
- global snapshot 跨阈值才改变梁子状态
- 网络 loading 不把中央梁子替换成 spinner
- last known good snapshot 可显示并标 stale

## Privacy

检查 network payload。
Vote POST 不得含：
- prompt
- response
- code
- file path
- API key
- raw session
- browser user_id self-claim
- local token self-claim
- remaining self-claim
- LiangziState self-claim

## Deliverables

- docs/090-online-integration-r2.md
- docs/091-state-authority-matrix-r2.md
- docs/092-network-payload-audit.md
- docs/093-day-rollover-r2.md

Acceptance Criteria:

1. Personal spendable incense 只由 backend authority 驱动。
2. Global ratio + LiangziState 只由同一 backend snapshot 驱动。
3. Personal token/remaining 不直接选择梁子状态。
4. 投票会影响 LiangQi intensity，不改变 ring fill。
5. global snapshot 跨阈值正确切梁子状态。
6. multiple tabs 不超投。
7. retry 不重复计票。
8. business date 来自 backend。
9. payload 最小化。
10. typecheck/test/e2e 通过。

完成后停止。
```

---

# 18. Codex Review B：Online Authority / Transaction Review

```text
Perform a read-only security and correctness review of `dsh-liangbiao` after online backend integration.

Do not edit files.

Frozen contract:

- binary UP/DOWN only
- 50k Input+Output tokens = 1 earned incense
- one vote = one used incense
- repeat voting allowed
- UP/DOWN share one personal incense pool
- zero global votes = WAITING / 待开梁
- Liangzi state depends only on global up ratio thresholds
- personal remaining controls LiangQi intensity
- personal token remainder controls LiangQi ring fill
- client must not be trusted for identity/token/incense/LiangziState
- backend atomically prevents overspending
- request_id idempotent

Review:

1. Can client forge user_id?
2. Can client forge effective_tokens?
3. Can client forge earned/remaining?
4. Can client bypass one-incense-per-vote?
5. Can two tabs overspend?
6. Can concurrent HTTP requests overspend?
7. Can duplicate retries double-vote?
8. Can request_id be replayed with changed direction?
9. Can unique_voters overcount?
10. Can midnight/day rollover double-spend?
11. Can stale case vote be accepted?
12. Can backend auth be confused with anonymous identity?
13. Is local Host-projected Token falsely treated as server-verifiable?
14. Is business date client-controlled?
15. Are global ratios raw UP/DOWN only?
16. Is zero vote state WAITING instead of fake 50/50?
17. Are 60/70/80/90 boundaries exact?
18. Do displayed ratios and LiangziState share one snapshot sequence?
19. Can personal token/remaining directly change LiangziState?
20. Does spending incense incorrectly change ring fill?
21. Does spending incense correctly affect LiangQi intensity?
22. Are stale Candidate/Ranking/Winner/PersonalAvatarTier concepts present?
23. Are logs/privacy safe?
24. Is DSH developer-preview compatibility isolated?

Output:
- Blocker
- High
- Medium
- Low
- Accepted limitation

For each:
file/line
attack/failure scenario
invariant violated
minimal fix
verification test

Do not modify files.
```

---

# 19. Prompt 10：发布前加固

```text
对梁标 V0.1 进行发布前加固。
本阶段不增加新产品功能。

## Semantic audit

全仓搜索并确认没有梁标业务意义上的：
- 稳
- neutral vote
- candidate
- ranking
- leaderboard
- winner
- top-n
- 大夯
- 偏夯
- 胶着
- 偏拉
- 大拉
- global LiangScore
- Bayesian prior
- BallotLedger
- 梁签核心票权
- 小难梁
- 牢梁
- 梁哥
- PersonalAvatarTier
- PersonalGrowthTier
- nextTier
- incenseToNextTier
- avatar tier depends on earned
- global ratio does not affect avatar
- vote cannot reduce LiangQi

## UI audit

四个视觉区域：
1. 今日梁案
2. 夯比例 | 梁子 + 梁气 | 拉比例
3. 夯/拉两个按钮
4. 全局香火 + 香客

中央：
- 0票待开梁
- 梁工/梁总/梁神/梁圣/梁祖

梁气：
- remaining incense 决定旺盛程度
- next-incense token progress 决定 ring fill
- “N 炷 / 再 X Token”整合在环中
- 不额外做个人成长层

## State audit

GlobalLiangState
PersonalLiangQiState
Vote transaction/ledger

必须数据源清晰。

测试：
- personal token 增长而 global ratio 不变 -> 梁子状态不变
- personal remaining 从 5->0 而 global ratio 不变 -> 梁子状态不变
- global ratio 79.x->80 -> 梁神->梁圣
- global ratio 89.x->90 -> 梁圣->梁祖
- 0 votes -> WAITING
- vote spend -> LiangQi intensity 下降
- vote spend -> ring fill 不变
- token progress -> ring fill 连续变化
- token threshold -> +1 incense + fill wrap

## Token audit

V0.1：Input + Output

DSH mapping：
uncached input + cache read + cache write + output

检查：
- 旧 0.1 cache-read 权重不存在
- cacheWrite 未漏
- reasoning 未重复
- Context Occupancy 未使用
- replay/restart/multi-session/day boundary

## P0 business tests

- 50K boundary matrix
- token remainder / toNext / fill
- 1 vote = 1 incense
- shared up/down pool
- repeated same direction
- mixed directions
- concurrent overspend
- idempotency
- unique voter
- 0 vote WAITING
- 59/60/70/80/90 ratio boundaries
- snapshot ratio/state consistency
- day rollover

## Authority audit

production：
- identity server-derived
- token authority server-derived
- remaining server-derived
- vote records server-owned
- business date server-owned
- GlobalLiangState server snapshot-owned

如果 production authority blocked：
- build/release 明确 dev/staging/local demo
- README 不得声称真实验证 Token 票权
- soft-trust 不默认生产开启

## DSH compatibility

- pinned commit
- public/internal API classification
- compat layer
- UI slot cleanup
- Host/Client cleanup
- polling cleanup
- HMR
- profile install/uninstall
- developer preview warning

## Accessibility

- keyboard
- focus
- tooltip
- escape
- reduced motion
- contrast
- zoom
- dark/light
- no continuous flashing
- screen reader 能读出 ratio、梁子状态、个人剩余香火、距下一炷 Token

## Performance

- no O(all history) fold per render
- no repeated full-session parse
- no unbounded map/queue
- no duplicated polling per tab
- no timer/listener leaks
- lazy artwork
- bounded cache

## Security

- input schema
- output schema
- auth
- rate limit
- transaction
- request idempotency
- log redaction
- secret storage
- timeout/cancel/retry
- dependency audit

## Docs

创建/更新：
- docs/100-release-readiness-r2.md
- docs/101-threat-model.md
- docs/102-known-limitations-r2.md
- docs/103-test-matrix-r2.md
- docs/PRIVACY.md
- docs/SECURITY.md
- docs/DATA_FLOW.md

Acceptance Criteria:

1. 全部 P0 test 通过。
2. 无第三选项/排名/winner。
3. 0票待开梁。
4. 五态只由 global up ratio。
5. Personal remaining 只影响梁气/可投资源，不直接选择梁子状态。
6. ring fill 只由 next-incense token progress。
7. ratio 与 LiangziState 同 snapshot。
8. backend authority 符合冻结要求或明确 blocked。
9. DSH clean profile smoke 通过。
10. plugin unload clean。
11. release readiness 明确 Go/No-Go。

完成后停止，不发布。
```

---

# 20. Prompt 11：Release Candidate

```text
准备 `dsh-liangbiao` V0.1 Release Candidate。

禁止自动：
- npm publish
- Git push
- GitHub Release
- production deploy
- 修改用户真实 profile

## README 核心描述

# 梁标

一句话：

`用 DSH 攒香火，投下“夯”或“拉”，共同把梁子从梁工一路夯成梁祖。`

产品解释必须准确：

- DSH Input+Output Token 累积成个人香火
- 每 50K Effective Token 默认获得 1 炷香
- 一炷香可以投一次“夯”或“拉”
- 夯/拉共用个人香火池
- 全网夯率决定中央梁子状态：待开梁 / 梁工 / 梁总 / 梁神 / 梁圣 / 梁祖
- 梁气是个人的：剩余几炷决定旺盛程度，距离下一炷的 Token 进度决定环形 fill
- 底部香火/香客表示社会化参与

不要写：
- 排行榜
- 胜者
- #1 梁位
- 梁签
- 全局梁分
- 七档旧称号
- 梁哥
- 个人 Avatar Tier
- 第三选项

## README state explanation

明确：

`Global Liangzi State`：
由今日全网 up/down accepted votes 计算，0票待开梁，夯率决定梁工→梁祖。

`remaining incense`：
当前用户尚未投出的香火，决定梁气旺盛程度，也是可投票余额。

`next-incense progress`：
当前用户距离再获得一炷香的 Token 进度，决定梁气环 fill。

`global incense`：
所有用户今日实际投出的有效票总数。

这些概念不得混淆。

## Security/Trust claim

根据 docs/075-backend-decision.md 真实状态写。

authority VERIFIED：准确描述验证边界。
authority 未 VERIFIED：明确 community/dev/soft-trust limitation，绝不能夸大。

## Install/package

使用当前 DSH 官方支持的 out-of-tree packaging。

执行：
- typecheck
- lint
- unit
- integration
- UI
- backend tests
- pack
- package content audit
- clean profile install
- WebUI launch
- plugin show
- token progress
- LiangQi ring progression
- earn +1 incense transition
- vote
- repeated vote
- global snapshot threshold transition
- zero-vote waiting state
- uninstall

## Release demo scenario

展示：

1. 今日梁案
2. 0票“待开梁”
3. 有票后按夯率显示梁工/梁总/梁神/梁圣/梁祖
4. 当前个人 5 炷香，梁气旺盛
5. 梁气环显示“再 3,000 Token”且接近满
6. 使用 DSH 增加 3,000 Token
7. 环满，凝成 +1 炷，随后环重新开始
8. 连续投夯/拉，remaining 下降，梁气变弱
9. ring fill 不因投票倒退
10. global snapshot 跨阈值时梁子状态变化
11. 底部香火/香客更新

## Assets

仍可使用 placeholder/original artwork。
人物素材与代码解耦。
不要打包未经授权第三方人物帧。

## Compatibility

记录：
- Liangbiao version
- tested DSH commit
- Node
- pnpm
- OS/browser
- host entry
- client entry
- token meter seam
- auth/authority mode
- Liangzi threshold policy version

创建：
- CHANGELOG.md
- RELEASE_CHECKLIST.md
- CONTRIBUTING.md
- SECURITY.md
- docs/INSTALL.md
- docs/TROUBLESHOOTING.md
- docs/COMPATIBILITY.md

生成本地 RC tarball。
不要发布。

Acceptance Criteria:

1. RC package 可在 clean DSH profile 安装。
2. UI 四区正确。
3. 0票待开梁。
4. 60/70/80/90 五态边界正确。
5. Token 50K 边界与 next-incense progress 正确。
6. LiangQi inventory/intensity 正确。
7. repeated vote 正确。
8. concurrent overspend / idempotency 正确。
9. privacy/network audit 正确。
10. README 不含旧个人五态错误语义。
11. authority claim 与实现一致。

完成后输出 release report，然后停止。
```

---

# 21. Codex Final Review

```text
Perform a final read-only release review of `dsh-liangbiao`.

Do not modify files.
Do not publish.

Verify frozen product contract:

1. Product is a single daily binary vote, not a ranking.
2. Only UP/夯 and DOWN/拉 exist.
3. Zero accepted votes => WAITING / 待开梁.
4. Active central Liangzi states are exactly:
   梁工 / 梁总 / 梁神 / 梁圣 / 梁祖.
5. Liangzi state depends only on global up ratio thresholds:
   <60 / 60–<70 / 70–<80 / 80–<90 / >=90.
6. Personal token/earned/remaining never directly selects Liangzi state.
7. Global displayed ratio and Liangzi state come from the same snapshot version.
8. Effective tokens = Input + Output.
9. DSH input mapping includes uncached + cache-read + cache-write.
10. Reasoning is not double counted.
11. 50,000 tokens = 1 earned incense by default.
12. 1 accepted vote = 1 used incense.
13. UP/DOWN share one personal incense pool.
14. Repeated voting is allowed.
15. Concurrent overspending is impossible.
16. request_id is idempotent.
17. unique voter increments only on first accepted vote.
18. Personal remaining incense controls LiangQi intensity.
19. Personal token remainder controls LiangQi ring fill.
20. Spending incense can reduce LiangQi intensity but must not reduce ring fill.
21. Crossing a token threshold earns +1 incense and wraps ring progress.
22. Global incense = up_votes + down_votes.
23. Client cannot forge identity/token/incense/LiangziState in production authority mode.
24. Business date is server-authoritative online.
25. No Candidate/Ranking/Winner/PersonalAvatarTier/third option remains.
26. README claims match actual trust model.

Also review:
- DSH public API compatibility
- lifecycle/unload
- polling cleanup
- multi-session token aggregation
- multi-tab behavior
- day rollover
- transaction isolation
- dependency/supply chain
- privacy
- package contents
- clean profile installation

Output:
- Release Blockers
- High
- Medium
- Low
- Accepted Limitations
- Missing Tests
- Final Go/No-Go

Every defect:
- file/line
- reproduction
- impact
- violated frozen rule
- fix
- verification test

Do not make style-only comments.
```

---
# 22. DSH 当前接口事实：给新会话的技术提醒

以下是 2026-08-16 对当前公开 DSH master 的外部核查结果。**实际开发仍以本地 pinned DSH commit 为最终事实来源。**

## 22.1 Token Meter

当前 `@deepseek-ai/dsh-token-meter` 的 durable `tokenUsage` projection 包含四个互斥累计 bucket：

- `uncachedInputTokens`
- `outputTokens`
- `cacheReadTokens`
- `cacheWriteTokens`

当前文档明确说明：

- reasoning 已包含在 `outputTokens`
- usage chunk 后的同 `(turn, step)` final usage 是 replacement，而不是再次相加
- durable projection 面向完整 session log，可跨 pagination/compaction/replay 保持累计语义
- Context Occupancy 是 UI reference，不是 billing/gating input

参考：

- [https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/README.md)
- [https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/projection.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/token-meter/src/projection.ts)
- [https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.md)

因此梁标 V0.1 的产品公式 Input+Output，在当前 DSH bucket 下应优先验证映射：

```
Input
= uncachedInput
+ cacheRead
+ cacheWrite

Effective
= Input + output
```

不要重新使用旧版 10% cache-read 权重。

## 22.2 DSH Identity

当前公开 DSH 有：

`@deepseek-ai/dsh-anonymous-user-id`

其语义是：

- 每个 Harness home 一个随机 UUID v4
- 持久化在 `$DSH_HOME/.anonymous-user-id`
- 可删除后重新生成
- 不由 hostname/IP/git remote 派生
- 被 telemetry / feedback / DeepSeek provider request header 等使用

参考：

- [https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/identity/anonymous-user-id/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/identity/anonymous-user-id/README.md)

**这证明 DSH 有稳定匿名标识，不证明它是可供梁标云端验证的 authenticated user identity。**

因此新 Prompt 把：

```
anonymous identity
```

和：

```
server-verifiable Auth
```

严格区分。

## 22.3 Developer Preview

DSH 当前仍明确处于 Developer Preview，官方提示会存在 compatibility-breaking changes。

参考：

- [https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md)
- [https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/AGENTS.md)

因此：

- 所有 DSH unstable seam 继续放 `compat/dsh`
- 每个 RC 固定 tested DSH commit
- Cursor 不得凭模型记忆猜 API
- 当前源码和 tests 优先于口头解释

---

# 23. P0 Verification Matrix（R2 总表）

后续任何一次大型重构后，都应至少跑这一组。

## 23.1 Token / 香火

```text
TOKEN_PER_INCENSE = 50,000

0         => earned 0, remainder 0, toNext 50,000
49,999    => earned 0, remainder 49,999, toNext 1
50,000    => earned 1, remainder 0, toNext 50,000
99,999    => earned 1, remainder 49,999, toNext 1
100,000   => earned 2
397,000   => earned 7, remainder 47,000, toNext 3,000, fill 94%
500,000   => earned 10
1,000,000 => earned 20
```

DSH bucket：

```text
uncachedInput 10k
cacheRead     20k
cacheWrite     5k
output        15k

Input = 35k
Effective = 50k
earned incense = 1
```

## 23.2 个人香火池

```text
earned=7
used=2
remaining=5
```

其中：

```text
used = accepted_up_by_me + accepted_down_by_me
```

夯/拉共享同一 remaining pool。

## 23.3 梁气

初始：

```text
remaining=5
remainder=47,000
fill=94%
toNext=3,000
```

视觉：

```text
5 炷
再 3,000 Token
```

必须整合进同一个 LiangQi 组件。

投一票后：

```text
remaining: 5 -> 4
LiangQi intensity: 下降
remainder: 47,000 不变
fill: 94% 不变
toNext: 3,000 不变
```

再产生 3,000 Token：

```text
earned +1
remaining +1
remainder -> 0
fill -> 0
toNext -> 50,000
```

播放短暂“凝香 / +1 炷”，随后继续下一圈。

## 23.4 梁子 WAITING + 五态

```text
0 votes      => 待开梁
up < 60%     => 梁工
60%–<70%     => 梁总
70%–<80%     => 梁神
80%–<90%     => 梁圣
>=90%        => 梁祖
```

精确边界：

```text
59.999% -> 梁工
60.000% -> 梁总
69.999% -> 梁总
70.000% -> 梁神
79.999% -> 梁神
80.000% -> 梁圣
89.999% -> 梁圣
90.000% -> 梁祖
100.00% -> 梁祖
```

## 23.5 全局/个人解耦

```text
personal remaining=0
global up=92%
=> 梁祖
```

```text
personal remaining=100
global up=65%
=> 梁总
```

```text
personal effective token +500k
global vote ratio unchanged
=> 梁子状态不变
```

## 23.6 全局 threshold crossing

构造某次 global snapshot：

```text
up_ratio: 79.x% -> 80.0%+
```

结果：

```text
梁神 -> 梁圣
```

状态变化原因只能是 global ratio。

同理：

```text
89.x% -> 90%+
梁圣 -> 梁祖
```

## 23.7 Repeat Vote

5 炷：

```text
up
up
up
up
up
```

五次全部成功，第六次失败。

## 23.8 Mixed Vote

```text
up
down
up
```

均合法，共消耗 3 炷。

## 23.9 Concurrent Overspend

```text
remaining=1
10/100 concurrent vote requests
```

最多一个 accepted。

## 23.10 Idempotency

相同 request_id 同 payload：

```text
exactly one spend
exactly one vote
```

相同 request_id 不同 payload：

```text
conflict
```

## 23.11 Unique Voter

同用户：

```text
first accepted vote => unique_voters +1
next 20 votes => +0
```

## 23.12 Global Ratio / Snapshot Consistency

```text
up=68
down=32

up_ratio=68%
down_ratio=32%
liangzi_state=梁总
```

`68%` 和 `梁总` 必须来自同一 snapshot sequence。

禁止：

```text
显示 79% + 梁圣
显示 83% + 梁神
```

除非 policy version 明确不同；同一页面同一 snapshot 不得 drift。

## 23.13 Zero Votes

```text
up=0
down=0
ratio=null/null
liangzi_state=WAITING
```

UI：
- 左右 `--`
- 中央待开梁
- 不伪造 50/50

## 23.14 Day Rollover

Backend business date 从 D 到 D+1：

- today token growth 归新日
- used incense 新日归零
- earned incense 按新日 token 重新计算
- LiangQi 使用新日 remaining + next-incense progress
- global stats 切新 Active DailyLiangCase
- 新 case 0 vote 时待开梁
- 昨天 vote 不进入今天
- browser local clock 不决定 rollover

---

# 24. 开发纪律

## 每个阶段独立 Cursor Chat

不要把本文所有 Prompt 一次性喂给 Cursor。

顺序执行。

每阶段：

1. Plan
2. review plan
3. Agent
4. tests
5. commit
6. next chat

## Git commits 建议

```text
fix: align Liangbiao semantics with global Liangzi and personal LiangQi
feat: implement global-ratio Liangzi WebUI
feat: add incense and Liangzi state domain model
docs: complete DSH authority spike
feat: integrate daily DSH input-output usage into LiangQi
feat: complete local incense voting loop
docs: design authoritative vote backend
feat: implement authoritative Liangbiao voting backend
feat: connect DSH plugin to Liangbiao backend
test: harden global Liangzi thresholds and personal LiangQi
chore: prepare Liangbiao v0.1 release candidate
```

## DSH repo 只读

```text
workspace/
├── deepseek-harness/   # reference, do not patch
└── liangbiao/          # product
```

## 不允许“为了快”做的捷径

- DOM 抓 Token
- UI model name 猜 Token
- browser localStorage 当票权账本
- 前端直接传 remaining_incense
- 前端直接传 earned_incense
- 前端自己指定 user_id
- 前端自己指定 LiangziState
- anonymous UUID 冒充 Auth
- local signature 私钥也放客户端却宣称可信
- 多 tab 各自持有独立余额
- vote accepted 前乐观永久扣香却无幂等恢复
- 用个人 Token/earned/remaining 直接切中央梁子状态
- 用梁子 global ratio 驱动个人梁气库存
- 把投票扣香错误实现为 ring fill 倒退
- 再造个人梁哥/梁总/梁神/梁圣/梁祖成长线
- 把“再 N Token 得 1 炷”单独堆成多余个人成长层
- ratio 和 LiangziState 使用不同 snapshot version

---

# 25. 新会话建议起手

将本文件导入新会话后，可直接说明：

```text
这是梁标 V0.1 当前唯一有效的产品冻结与 Cursor Prompt Pack（R2）。

最终冻结：
- 梁文锋统一称“梁子”
- 0票待开梁
- 全网夯率决定：梁工 / 梁总 / 梁神 / 梁圣 / 梁祖
- 个人 LiangQi 只表示 remaining incense + 距下一炷 Token progress
- remaining incense 决定梁气旺盛程度
- token remainder 决定梁气环 fill
- “N 炷 / 再 X Token”整合在梁气环中
- 个人 Token 不驱动中央梁子状态

Prompt 01 已完成。
请从 Prompt 01B R2 开始逐阶段推进。
不要恢复本文已废弃的任何旧模型。
```

如 Prompt 01B R2 已执行完成：

```text
Prompt 01B R2 已完成，下面是 Cursor 的执行结果。
请基于本文件检查结果，然后进入 Prompt 02。
```

---

# END

---

# PART B — 4 步最终执行 Prompts

# 梁标 V0.1 — Cursor 4 步最终开发 Prompts（R3）

> 使用方式：
> 1. 将 `梁标_V0.1_产品冻结与_Cursor_Prompt_Pack_R2.md` 放入梁标仓库，建议路径：`docs/LIANGBIAO_CURSOR_MASTER_R3.md`。
> 2. Cursor 每个阶段开一个新 Chat。
> 3. 依次执行下面 4 个 Prompt。
> 4. 每阶段允许 Cursor 自主 Plan → Implement → Test → Fix → Commit；除 P0 无法继续外，不要中途停下来等确认。
> 5. `../deepseek-harness` 始终只读，实际 API 以本地 pinned DSH commit 为事实来源。

---

# PROMPT 1 / 4 — 产品语义纠偏 + 正确 UI + Domain 一次完成

```text
你现在负责完成「梁标 V0.1」第一大阶段。

不要只做 Plan。先 Plan，然后立即进入 Agent/Implement，持续完成本 Prompt 的全部内容；遇到普通实现问题自行解决并继续。只有真正的 P0 阻塞才停止。

## 唯一事实源

先完整阅读：

- `AGENTS.md`
- `docs/LIANGBIAO_CURSOR_MASTER_R3.md`
- 当前仓库已有 docs/tests/src
- Prompt 00/01 已经生成的 DSH plugin skeleton
- 当前本地 `../deepseek-harness` 中已验证的 UI Slot / Host / Client conventions

`docs/LIANGBIAO_CURSOR_MASTER_R3.md` 是梁标产品语义最高优先级事实源。
任何旧代码、旧文档、旧测试、旧 Prompt 与它冲突时，以本文件冻结语义为准。

不要修改 `../deepseek-harness`。
不要凭模型记忆猜 DSH API。

---

## A. 先做全仓业务语义纠偏

全仓搜索并清除/修正梁标业务语义中的旧模型：

- 稳 / neutral / steady / third option
- candidate / ranking / leaderboard / winner / top-n
- 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉
- LiangScore / Bayesian prior
- BallotLedger / LiangBallot / 梁签
- 小难梁 / 牢梁 / 老梁
- 旧个人五态 `梁哥 -> 梁总 -> 梁神 -> 梁圣 -> 梁祖`
- “个人 Token / earned incense / remaining incense 驱动中央人物”
- “投票后梁气不能下降”
- cacheRead 只算 10%

保留通用 DSH plugin skeleton、Host/Client/build/profile 安装结构。
不要因为业务纠偏推倒工程重来。

更新 `AGENTS.md`，冻结以下最重要的不变量：

### 产品

- 产品名：梁标
- 梁文锋在产品 UI 中统一称为：梁子
- Hover/Focus：`今日梁位`
- Panel title：`今日梁案`
- 每天原则上一个 Active 梁案
- 投票只有 `up/down`，UI 只有 `夯/拉`
- 绝无第三选项、Candidate、Ranking、Winner

### 中央梁子

中央梁子只由同一份 Global Snapshot 的全网夯比例决定：

- total_votes = 0 -> `WAITING / 待开梁`
- up_ratio < 60% -> `梁工`
- 60% <= up_ratio < 70% -> `梁总`
- 70% <= up_ratio < 80% -> `梁神`
- 80% <= up_ratio < 90% -> `梁圣`
- up_ratio >= 90% -> `梁祖`

`待开梁` 不是第六 Tier，只是零票占位态。

中央梁子绝不能直接依赖：
- personal effective token
- earned incense
- used incense
- remaining incense
- LiangQi progress/intensity

左右夯/拉百分比和中央梁子状态必须来自同一个 snapshot/version，不能状态漂移。

### 梁气

梁气只属于当前用户个人，只表达：

1. `remaining_incense`：现在还剩几炷香可投
2. `token_progress_to_next_incense`：距离下一炷香的 Token 连续进度

设计原则：

- 已有几炷香 -> 决定梁气“旺盛程度”
- 距下一炷 Token 进度 -> 决定梁气环从空到满的 fill
- “再 3,000 Token 得 1 炷”必须直接整合进梁气环/中心微文案，禁止单独再制造一层个人成长区
- 投票消耗香火后 `remaining_incense` 会下降，因此梁气旺盛程度可以下降
- 投票不会回退已经产生的 Token remainder/progress
- Token 满 50K 时获得新香，库存 +1，并重新开始下一炷进度
- 梁气没有个人 Tier

### Token -> 香火

默认：

`LIANG_TOKEN_PER_INCENSE = 50000`

Effective Token 产品定义：

`Input + Output`

如当前 DSH provider usage 为：

- uncachedInputTokens
- cacheReadTokens
- cacheWriteTokens
- outputTokens

则 compat adapter 应标准化为：

`input = uncachedInput + cacheRead + cacheWrite`
`effective = input + output`

reasoning 如果已经属于 output，不得重复累计。
不使用 Context Occupancy。

个人：

`earned_incense = floor(effective_tokens / token_per_incense)`
`used_incense = accepted personal votes`
`remaining_incense = earned_incense - used_incense`

夯/拉共用一个香火池。

### Global

- up_votes
- down_votes
- total_incense = up_votes + down_votes
- unique_voters
- up_ratio/down_ratio
- liangzi_state
- snapshot sequence/capturedAt

### Vote

- 1 accepted vote = 1 used incense
- 可以连续夯
- 可以连续拉
- 可以夯拉混投
- remaining > 0 即可继续投
- request_id 幂等
- remaining=1 并发 N 个 request，最多成功一个

---

## B. 一次完成正确 UI

在现有 DSH UI Slot 上实现完整 Mock UI。

严格四个视觉区域，不再做旧版“五层个人成长 UI”。

### Region 1 — 今日梁案

显示：

`今日梁案`

mock case：

`DeepSeek Harness 是夯还是拉`

### Region 2 — 中央核心区

布局语义：

`夯 83%    [梁子 + 个人梁气环]    拉 17%`

要求：

- 中央视觉权重最大
- 建立可替换 artwork 的 `LiangAvatar` abstraction
- 五态 + WAITING 均有明显视觉差异
- 可先用原创 SVG/CSS placeholder
- 不使用普通 Gauge/Donut 替代梁子
- 梁气环围绕梁子
- 梁气 overlay 只属于当前用户

视觉方向：

- 待开梁：灰度/未点香/低存在感
- 梁工：工牌/正常上班人
- 梁总：西装/气场上升
- 梁神：光环/轻悬浮/显灵
- 梁圣：圣光/法相
- 梁祖：祖师法相/最高荒诞感

梁气示例：

当前：
- remaining_incense = 5
- token remainder = 47,000 / 50,000
- tokens_to_next = 3,000

不要在头像下面再单独放：
`再 3,000 Token 得 1 炷`

而要把它整合到梁气环的视觉/中心微文案中，例如环内轻量表达：

`5 炷 · +3000`

或等价更克制设计。

完整含义必须可访问：
- 当前剩余 5 炷
- 再 3000 Token 获得 1 炷

### Region 3 — 两个按钮

只有：

`[ 夯！ ]    [ 拉！ ]`

mock vote accepted：

- remaining incense -1
- 对应 global raw/mock count +1
- token progress 不变
- 梁气旺盛程度随库存下降
- 如果当前 mock global snapshot同步更新，则重新按 global up ratio 派生梁子状态
- 不允许从个人库存直接改变梁子状态

remaining=0 时 disabled，并有清楚 reason。

### Region 4 — 社会化

`🔥 香火 12,846    👤 香客 2,841`

---

## C. 一次完成纯 Domain Model

Domain 必须无 React/DSH/network/DB 依赖。

至少建立：

- DailyLiangCase
- BusinessDate
- VoteType
- VoteIntent
- VoteResult
- GlobalLiangState
- PublicLiangSnapshot
- LiangziState / LiangziStatePolicy
- PersonalLiangQiState
- TokenUsageInput
- EffectiveTokenPolicy
- IncenseAccountingPolicy
- RequestId

不要创建：

- Candidate
- Ranking
- Winner
- Leaderboard
- LiangScore
- BallotLedger
- LiangBallot
- PersonalAvatarTier

### Global policy

用纯函数实现：

`deriveLiangziState(upVotes, downVotes)`

精确边界：

- 0/0 => WAITING
- 59.999% => LIANG_GONG
- 60% => LIANG_ZONG
- 69.999% => LIANG_ZONG
- 70% => LIANG_SHEN
- 79.999% => LIANG_SHEN
- 80% => LIANG_SHENG
- 89.999% => LIANG_SHENG
- 90% => LIANG_ZU
- 100% => LIANG_ZU

Global Snapshot 必须保证：

`up_ratio/down_ratio/liangzi_state` 来自同一组 up/down counts 和同一 version。

### Personal LiangQi

至少派生：

- effectiveTokensToday
- earnedIncense
- usedIncense
- remainingIncense
- tokenRemainder
- tokenProgressToNextIncense
- tokensToNextIncense

规则：

`earned = floor(effective / 50000)`
`remaining = earned - used`
`tokenRemainder = effective % 50000`
`progress = tokenRemainder / 50000`
`tokensToNext = 50000 - tokenRemainder`

特殊情况 effective=0 或刚好整除时，UI 应能正确表达下一炷完整 50K，而不是错误显示“再 0 Token”。

`remainingIncense` 影响梁气 intensity；`tokenProgress` 影响 ring fill。
二者不得驱动梁子五态。

### Vote rule

一个 accepted vote：
- used +1
- remaining -1
- up 或 down +1

同一个人所有方向共享同一库存。

---

## D. P0 Tests 必须一次补齐

### Token

50000 为一炷：

0 -> earned 0
49,999 -> 0
50,000 -> 1
99,999 -> 1
100,000 -> 2
500,000 -> 10
1,000,000 -> 20

DSH bucket fixture：

uncached=10k
cacheRead=20k
cacheWrite=5k
output=15k
=> input=35k
=> effective=50k
=> earned=1

### Personal inventory

earned=5, used=2 => remaining=3

投一次：
earned=5, used=3, remaining=2

### Repeat/mixed

5 炷连续 up 五次均合法，第六次 insufficient。

3 炷：up/down/up 均合法。

### Liangzi threshold

精确覆盖 0 票和 60/70/80/90 边界。

### Independence

同一 global snapshot 下：

personal remaining = 0 / 5 / 100
personal token progress = 0% / 50% / 99%

中央梁子状态必须完全相同。

同一个 personal LiangQi 下：

global up ratio 从 55 -> 65 -> 75 -> 85 -> 95

梁气库存和 token progress 必须完全不变。

### Threshold crossing by vote

当 raw/global state 从：

up=79, down=21

接受一张 up 后，如果当前测试使用即时 snapshot：
按新 ratio 重新计算中央梁子。

证明这次变化来自 global ratio，而不是“投票者个人香火减少”。

### Zero vote

0/0：
- ratio = null/null
- state = WAITING
- UI 不伪造 50/50

### Invalid

negative / NaN / Infinity / unsafe integer / used>earned / malformed snapshot 全部 fail safe。

---

## E. Docs / Verification

创建或更新：

- `docs/PRODUCT_FREEZE_V0.1.md`
- `docs/SEMANTIC_CORRECTION_R2.md`
- `docs/020-ui-v0.1.md`
- `docs/030-domain-model-v0.1.md`
- `docs/031-domain-invariants.md`
- `docs/032-p0-test-matrix.md`
- UI mock screenshot 到 `docs/assets/`

实际在当前 DSH WebUI 挂载验证：

- 不遮挡 composer/navigation
- light/dark 正常
- keyboard/focus/Escape 正常
- reduced motion
- unload 后 UI 完全消失
- console 无错误

执行所有相关：

- typecheck
- lint（如项目已有）
- unit tests
- UI/component tests
- build
- DSH smoke

修复直到通过。

完成后创建一次清晰 commit，例如：

`feat: align Liangbiao R2 semantics and implement UI domain`

最后只报告：

- files changed
- obsolete semantics removed
- final UI/domain implemented
- test/build results
- remaining P0 risks
- commit hash

然后停止。
```

---

# PROMPT 2 / 4 — DSH Authority Spike + 真实 Token + 本地完整闭环一次完成

```text
你现在负责「梁标 V0.1」第二大阶段。

不要只做调研文档。请按顺序完成：

1. DSH Auth/Token Authority 源码审查
2. Decision Gate A
3. 真实 DSH Token -> Personal LiangQi
4. Fake Authoritative Service 本地完整投票闭环
5. 一轮内部 correctness review
6. 修复问题、测试、commit

除真正无法继续的 P0 外，不要中途停下来等确认。

## 先读取

- `AGENTS.md`
- `docs/LIANGBIAO_CURSOR_MASTER_R3.md`
- Prompt 1 产生的全部 docs/domain/tests
- 当前本地 pinned `../deepseek-harness`

`../deepseek-harness` 只读。
所有 DSH API 判断必须引用本地源码 path/symbol，不凭记忆。

---

## A. DSH Authority / Integration Spike

回答并记录：

### Identity

1. DSH 是否存在 authenticated current user？
2. 第三方 plugin 是否可读取？
3. Liangbiao backend 是否能 server-side 验证该 identity？
4. `anonymous-user-id` 的真实安全语义是什么？
5. 能否重置？
6. 是否仅 pseudonymous id，而不是 Auth？
7. provider request header 中是否存在 harness identity？
8. 外部 backend 能否验证真实性？

### Token

确认当前 provider-reported usage：

- uncachedInputTokens
- cacheReadTokens
- cacheWriteTokens
- outputTokens

验证：

`Input = uncached + cacheRead + cacheWrite`
`Effective = Input + output`

同时确认：

- buckets 是否互斥
- reasoning 是否已经计入 output
- chunk/final replacement semantics
- replay/restart semantics
- compaction/pagination
- multi-session aggregation
- 是否有 whole-profile aggregate
- business date 过滤方式

### Server-verifiable authority

搜索：

- remote usage ledger
- signed usage receipt
- authenticated usage API
- token/accounting backend
- server-verifiable identity
- server-verifiable DSH usage

建立 trust table：

Source | Host readable | Browser readable | Backend verifiable | User modifiable | Production eligibility suitable

至少覆盖：

- browser state
- Host local projection
- session log
- anonymous-user-id
- provider response usage
- 发现的 remote API

### DSH integration conventions

确认：

- Host/Client communication
- HTTP/BFF/RPC pattern
- local persistence
- sqlite/transaction/idempotency examples
- toast/dialog/theme
- UI slot
- cleanup lifecycle
- public vs internal API

### Business date

在线模式必须 backend/server authority。
本地模式使用显式 configurable dev timezone。
禁止 browser local date 成为唯一票权 authority。

---

## B. Decision Gate A

必须明确输出一个：

- A1 Fully verifiable
- A2 Identity verifiable, Token not verifiable
- A3 Token observable locally, identity/authority not verifiable
- A4 No suitable authority

规则：

- 不把 anonymous ID 冒充 Auth
- 不把 Host 本地可读等价成 backend 可验证
- 不发明不存在的 API
- 不设计客户端持私钥的伪“可信签名”
- 不因为后续开发方便偷偷降级安全原则

即使是 A2/A3/A4，也不要停止整个本阶段：

- production trusted voting 标记 BLOCKED
- 继续完成真实本地 Token UX
- 继续完成 Fake Authoritative Service 本地完整闭环
- 为第三阶段留下明确 authority mode

---

## C. 接真实 DSH Token -> Personal LiangQi

只使用已验证 seam。

目标：

DSH provider usage
-> effective_tokens_today
-> earned_incense
-> token remainder/progress
-> personal remaining incense（在 local fake authority 模式下）
-> 梁气 UI

### 聚合

正确处理：

- multiple sessions
- replay
- restart
- reconnect
- pagination
- compaction
- duplicate notification
- usage chunk/final replacement
- new sessions
- day rollover

V0.1 不做 TARGET_MODEL filter。

Host 建立类似：

`LocalObservedDailyUsage`

包含：

- businessDate
- inputTokensToday
- outputTokensToday
- effectiveTokensToday
- observedAt

Domain 派生：

- earnedIncense
- tokenRemainder
- tokenProgress
- tokensToNext

注意：
如果 production authority 尚未 VERIFIED，本地 observed token 只能称为 local observed/provisional，不能在 docs/type naming 中冒充 server-verifiable eligibility。

### UI

Personal LiangQi 替换 mock：

- 当前 remaining incense
- 梁气 intensity
- 下一炷 ring progress
- ring 内整合“还差多少 Token”

不要恢复单独个人成长层。
不要让 personal token 改中央梁子状态。

开发 diagnostics 可展示：

- input/output/effective
- earned
- used/remaining（若来自 fake authoritative service）
- token remainder/progress
- business date
- last update

禁止展示 prompt/response/API key/raw session。

---

## D. FakeAuthoritativeLiangService 完整闭环

建立 dev/test adapter，明确不是 production backend。

它维护：

- DailyLiangCase
- authoritative-like personal incense state
- raw GlobalLiangState
- PublicLiangSnapshot
- vote records
- idempotency store

在 dev/test 中可把 local observed effective token 同步给 fake service。
生产 API 以后禁止接受该字段。

### 本地体验闭环

1. DSH Token 增长
2. 获得香火
3. 梁气库存/intensity 增长
4. 下一炷 ring 连续增长
5. 用户投 `夯` 或 `拉`
6. accepted 后：
   - used +1
   - remaining -1
   - 梁气 intensity 下降
   - token remainder/progress 不因投票下降
   - raw up/down +1
   - total incense +1
   - 首次成功投票 unique voters +1
7. Global Snapshot 更新后：
   - 左右 ratio 更新
   - 中央梁子按 snapshot 的 up ratio 更新
8. personal LiangQi 与梁子五态彻底解耦

### Snapshot

区分：

- personal spend response：立即
- global public snapshot：可低频，例如默认 5 min，测试用 fake clock

所有客户端看到的：

- up/down percentage
- Liangzi state

必须来自同一 snapshot/version。

允许 vote accepted 后先显示 `已上香`，而全网 ratio/梁子等下一次 snapshot。

### Concurrency

remaining=1，10/100 concurrent different request_id：
最多 1 accepted。

### Idempotency

同 request_id + same payload：
返回同一业务结果，不重复扣香/计票/香客。

同 request_id + conflicting vote type：
结构化 conflict。

### Multiple clients/tabs

本地 fake authoritative service 必须保证共享同一余额，不允许每个 tab 各自双花。

---

## E. 强制测试

### Real token mapping

uncached=10k
cacheRead=20k
cacheWrite=5k
output=15k
=> effective=50k
=> earned=1

reasoning 不重复。

### Replay/restart

不重复加 Token。

### Multi-session

当日所有符合规则的 session 正确合计。

### Day rollover

新日 token 重新开始，旧日不混入。

### LiangQi

47k remainder：
ring=94%，tokensToNext=3k。

投票前 remaining=5；投票后 remaining=4：
ring 仍=94%，只降低 intensity/库存表现。

### Global Liangzi

0 vote = WAITING
55% = 梁工
65% = 梁总
75% = 梁神
85% = 梁圣
95% = 梁祖

改变个人 remaining/token progress 不得改变上述状态。

### Vote threshold crossing

只有 Global Snapshot ratio crossing 才能让中央梁子变化。

### Concurrency/idempotency/unique voters/repeat/mixed

全部覆盖。

---

## F. Deliverables

创建/更新：

- `docs/040-dsh-authority-spike.md`
- `docs/041-dsh-token-mapping.md`
- `docs/042-auth-trust-model.md`
- `docs/043-decision-gate-a.md`
- `docs/044-dsh-current-ui-backend-conventions.md`
- `docs/050-real-token-integration.md`
- `docs/051-daily-token-aggregation.md`
- `docs/052-local-vs-authoritative-state.md`
- `docs/060-local-full-loop.md`
- `docs/061-vote-state-machine.md`
- `docs/062-concurrency-idempotency.md`
- local full-loop screenshot 到 `docs/assets/`

内部做一次 read-only-style review，重点查：

- stale old semantics
- wrong token mapping
- replay duplication
- personal/global coupling
- concurrency overspend
- idempotency
- multiple tabs
- resource cleanup

发现问题直接修复，然后重跑：

- typecheck
- lint
- unit
- integration
- UI/e2e
- build
- actual DSH smoke

全部通过后 commit，例如：

`feat: integrate DSH usage and complete local Liangbiao loop`

最后只报告：

- Decision Gate A result
- verified DSH seams
- implemented real token integration
- local full-loop result
- test results
- remaining production blockers
- commit hash

然后停止。
```

---

# PROMPT 3 / 4 — Authority Backend + Online Integration 一次完成

```text
你现在负责「梁标 V0.1」第三大阶段：Backend + Online Integration。

不要重复前面的产品讨论。直接读取事实和 Decision Gate，设计并实现。

## 先读取

- `AGENTS.md`
- `docs/LIANGBIAO_CURSOR_MASTER_R3.md`
- `docs/043-decision-gate-a.md`
- `docs/042-auth-trust-model.md`
- `docs/062-concurrency-idempotency.md`
- Prompt 1/2 的 domain/tests/docs

---

## A. Authority mode 必须先锁定

如果 Decision Gate = A1 且 identity + token usage 都 server-verifiable：

`AUTHORITY_MODE=VERIFIED_PRODUCTION`

实现真实 production authority。

如果 A2/A3/A4：

`AUTHORITY_MODE=DEV_STAGING_ONLY`

仍然完成 backend schema、transaction、API、Host integration 和 staging/local online loop，但必须：

- production trusted vote endpoint 默认 disabled/blocked
- runtime/build/docs 明确 staging/soft-authority
- 不把 local Host token self-claim 描述为 secure/verified
- 不偷偷把 anonymous ID 当 authenticated user
- README 最终必须诚实说明 trust boundary

不要因为 authority blocked 就放弃本阶段其它工程工作。

---

## B. Backend Domain / DB

至少设计：

### DailyLiangCase

- id
- business_date
- title
- status
- created/opened/closed timestamps

同一 business date 原则上一个 active case。

### LiangVote

- id
- case_id
- user_id（production 必须 server-derived）
- vote_type: up/down
- request_id
- created_at

支持 idempotency unique constraint 和 conflicting payload detection。

### UserDailyLiangState

- user_id
- business_date
- authoritative_effective_tokens（若 authority verified）
- used_incense
- updated_at
- version

派生：

- earned_incense
- remaining_incense
- token remainder/progress（如果 backend拥有 raw effective token）

### DailyLiangStats

- case_id
- up_votes
- down_votes
- total_incense
- unique_voters
- version
- updated_at

### PublicLiangSnapshot

同一个 version 中包含：

- up_votes
- down_votes
- total_incense
- unique_voters
- up_ratio/down_ratio
- liangzi_state
- captured_at
- sequence/version

禁止单独异步派生一个与 ratio 不同版本的 Liangzi state。

---

## C. Production trust boundary

客户端/Browser/Host 的 Vote business payload 不得让 backend 信任：

- user_id
- effective_tokens
- earned_incense
- used_incense
- remaining_incense
- Liangzi state
- LiangQi state

Vote intent 最小 body：

- case_id
- vote_type
- request_id

production user identity 必须来自已验证 auth context。
production token eligibility 必须来自已验证 server-verifiable token source。

如果无法做到，endpoint 只能处于 DEV/STAGING authority mode。

---

## D. Vote Transaction

对 authenticated/server-resolved user + active case 原子完成：

1. server clock/business date 校验
2. case active/stale 校验
3. resolve authoritative identity
4. refresh/read authoritative effective token（verified mode）
5. calculate earned incense
6. lock/CAS user daily state
7. check request_id
8. duplicate same payload -> return original result
9. duplicate conflicting payload -> reject
10. verify `used < earned`
11. insert LiangVote
12. `used += 1`
13. corresponding up/down +=1
14. `total_incense +=1`
15. first accepted vote for user/case/day -> `unique_voters +=1`
16. commit
17. return authoritative personal spend state

证明并测试：

remaining=1 + 100 concurrent requests -> accepted <= 1。

同一用户可：

- up/up/up
- down/down/down
- up/down/up

方向不创建独立票池。

---

## E. Server time / business date

Backend authority：

- server_time
- business_timezone
- business_date

客户端时钟不决定 eligibility。

覆盖：

- midnight race
- stale case id
- old request retry after rollover
- active case transition

---

## F. APIs

### GET `/v1/bootstrap`

返回：

- server_time
- business_date
- business_timezone
- authority_mode
- active_case
- token_policy
- authoritative_personal_state
- global_snapshot
- snapshot_refresh_seconds

### POST `/v1/votes`

body 只允许：

- case_id
- vote_type
- request_id

response：

- accepted/rejected result
- authoritative personal state
- accepted request id
- current/global snapshot version metadata

不需要每次 Vote 都立即返回新的全网比例。

### GET `/v1/snapshot`

返回 PublicLiangSnapshot。

可选：

`GET /v1/me/daily-state`

---

## G. Global snapshot policy

raw aggregate transaction 内立即正确。
public snapshot 可以低频，例如默认 300 秒并配置化。

前端：

- personal remaining：accepted 后立即更新
- global up/down + Liangzi：等同一 snapshot/version 更新

严格保持：

`ratio + Liangzi state = same snapshot`

零票 snapshot：

- ratios null
- state WAITING

---

## H. DSH Host <-> Backend Integration

Browser Client 只 UI + command。
DSH Host 负责 backend communication。

### Bootstrap

Host：

1. load last known presentation cache
2. `/v1/bootstrap`
3. 接受 backend business date/time
4. active case
5. personal authoritative state
6. public snapshot
7. token policy
8. authority mode

### State merge

#### Global

只来自 backend PublicLiangSnapshot：

- ratios
- total incense
- unique voters
- Liangzi state

#### Personal LiangQi

online vote availability 必须以 backend authoritative spend state 为准。

如果 backend 能提供 authoritative effective token，则 ring progress 也以 backend 为准。
若因为 authority architecture 只能提供 earned/remaining 而 local observed token 用于 UX ring，请明确标注 local-observed discrepancy diagnostics，不能用 local 较大值越权开放投票。

### Vote

Client -> Host：`vote(up/down)`

Host：

- 生成/持有 request_id
- POST `/v1/votes`
- network uncertain 时重试同 request_id
- 禁止因 timeout 生成新 request_id 规避不确定结果

Accepted：

- personal remaining 立即更新
- 梁气 intensity 立即变化
- token progress 按 authoritative/local-observed source 规则保持
- 显示 `已上香`
- 不本地伪造新的 global percentage/Liangzi state

Snapshot refresh 后再一起更新：

- up/down ratio
- Liangzi state
- total incense
- unique voters

### Multiple tabs

Host/Backend 统一 authority。

remaining=1，两 tab 同时不同方向：
最多一个成功，最终都收敛 remaining=0。

### Polling

- config cadence
- jitter
- bounded retry
- AbortController
- stale-while-revalidate
- cleanup on unload
- 不需要 per-vote WebSocket

### Day rollover

只跟 backend business_date。

新日：

- case change
- personal day state change
- global snapshot change
- 昨日 vote/token 不混今天

---

## I. Security / Privacy

实现并测试：

- auth validation
- input/output runtime schema
- body size limit
- rate limit
- timeout/cancel/retry
- structured errors
- request_id format/length bound
- exact vote enum up/down
- SQL/transaction safety
- log redaction
- no raw credentials
- no prompt/model output/session content
- browser payload 不携带 user_id/self-claimed token/self-claimed remaining

---

## J. P0 Tests

必须覆盖：

1. 50K token boundary
2. only up/down
3. repeat voting
4. mixed voting
5. one vote one incense
6. concurrent overspend
7. idempotent retry
8. conflicting idempotency payload
9. unique voter first vote only
10. stale case reject
11. midnight rollover
12. client clock cannot alter eligibility
13. global ratio accuracy
14. zero vote WAITING
15. exact 60/70/80/90 Liangzi thresholds
16. ratio/Liangzi same snapshot version
17. changing personal LiangQi cannot change Liangzi
18. changing global snapshot cannot change personal incense/token progress
19. two-tab race
20. network retry does not double vote

---

## K. Deliverables

创建/更新：

- `docs/070-backend-architecture.md`
- `docs/071-database-schema.md`
- `docs/072-vote-transaction.md`
- `docs/073-business-date.md`
- `docs/074-authority-data-flow.md`
- `docs/075-backend-decision.md`
- `docs/080-backend-api.md`
- `docs/081-backend-security.md`
- `docs/082-backend-tests.md`
- `docs/090-online-integration.md`
- `docs/091-state-authority-matrix.md`
- `docs/092-network-payload-audit.md`
- `docs/093-day-rollover.md`

做一次完整 online authority/security review。
发现 Blocker/High 直接修复，不只写报告。

执行：

- typecheck
- lint
- backend unit/integration tests
- transaction/concurrency tests
- frontend tests
- e2e
- build
- actual DSH online/staging smoke

修到通过。

commit，例如：

`feat: add authoritative Liangbiao backend and online integration`

如果 authority blocked，commit message 可准确写 staging，例如：

`feat: add Liangbiao backend with staging authority integration`

最后只报告：

- authority mode
- backend implemented
- online integration implemented
- security/concurrency results
- tests
- remaining production blocker（如有）
- commit hash

然后停止。
```

---

# PROMPT 4 / 4 — 全面加固 + Release Candidate + Final Review 一次完成

```text
你现在负责「梁标 V0.1」最后阶段：Release Hardening + RC。

本阶段不新增产品功能，不重新讨论产品设计。
直接审计、修复、验证、打本地 RC。

禁止自动：

- npm publish
- git push
- GitHub Release
- production deploy
- 修改用户真实 DSH profile

## 先读取

- `AGENTS.md`
- `docs/LIANGBIAO_CURSOR_MASTER_R3.md`
- 所有 Prompt 1–3 docs
- `docs/075-backend-decision.md`
- 当前 git diff/history

---

## A. Semantic Final Audit

全仓确认没有梁标业务意义上的：

- 稳 / neutral / third option
- candidate / ranking / leaderboard / winner / top-n
- 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉
- LiangScore / Bayesian prior
- 梁签 / BallotLedger
- 小难梁 / 牢梁 / 老梁
- 个人 Avatar Tier
- 个人 Token/香火直接决定中央梁子
- global ratio 决定个人梁气
- cacheRead 10% 旧公式

最终产品必须是：

- `WAITING 待开梁`
- `梁工 / 梁总 / 梁神 / 梁圣 / 梁祖`
- only up/down = 夯/拉

---

## B. UI Final Audit

严格四个视觉区域：

1. 今日梁案
2. 夯比例 | 梁子 + 个人梁气环 | 拉比例
3. 夯 / 拉两个按钮
4. 全局香火 / 香客

检查：

- 没有多余个人成长行
- `再 N Token 得 1 炷` 已融合进梁气环
- remaining incense 决定梁气旺盛程度
- token remainder/progress 决定 ring fill
- vote 会降低库存/intensity
- vote 不会回退 token progress
- global snapshot crossing 才改变梁子状态
- WAITING 和 5 态视觉明显
- reduced motion
- light/dark
- keyboard/focus/Escape
- tooltip
- disabled reason
- zoom/contrast
- no flashing

---

## C. Token / Accounting Audit

确认：

`Effective = uncached input + cache read + cache write + output`

且：

- reasoning 不重复
- Context Occupancy 未参与票权
- replay/restart 不重复
- compaction/pagination 正确
- multi-session 正确
- day boundary 正确

P0 boundary：

0 -> 0
49,999 -> 0
50,000 -> 1
99,999 -> 1
100,000 -> 2
500,000 -> 10
1M -> 20

个人库存：

`remaining = earned - used`

夯/拉共享同一库存。

---

## D. Global Liangzi Audit

精确验证：

- no vote -> WAITING
- <60 -> 梁工
- [60,70) -> 梁总
- [70,80) -> 梁神
- [80,90) -> 梁圣
- >=90 -> 梁祖

所有 UI percentage + Liangzi state 必须来自同一 PublicLiangSnapshot version。

测试：

个人 remaining/token progress 任意变化 -> Liangzi state 不变。

Global snapshot 变化 -> personal remaining/token progress 不变。

---

## E. Vote / Backend Audit

全部 P0：

- 1 accepted vote = 1 incense
- repeated up
- repeated down
- mixed up/down
- remaining=1 concurrent 100 -> <=1 accepted
- duplicate same request -> exactly one spend/vote
- same request id conflicting payload -> reject
- first accepted vote only increments unique voter
- stale case reject
- midnight rollover safe
- multiple tabs safe
- network retry safe
- server clock/business date authority

Production verified mode：

- identity server-derived
- token authority server-derived
- remaining server-derived
- client cannot forge user/token/incense

DEV/STAGING authority mode：

- production trusted endpoint default disabled
- docs/README do not overclaim trust
- authority mode visible in diagnostics/build metadata where appropriate

---

## F. DSH Compatibility / Lifecycle

检查并修复：

- pinned tested DSH commit
- public/internal API classification
- unstable seam isolated in `compat/dsh`
- Host/Client cleanup
- listeners/timers/AbortControllers cleanup
- polling deduplicated
- no per-tab duplicate poller if Host can centralize
- HMR
- plugin unload
- clean profile install/uninstall
- developer-preview compatibility warning

`../deepseek-harness` 不修改。

---

## G. Performance / Security

Performance：

- no O(all history) fold per render
- no repeated full log parse
- no unbounded queue/map
- bounded caches
- lazy artwork
- no timer leak
- no duplicate polling

Security：

- runtime schemas
- auth
- transaction isolation
- rate limit
- idempotency
- request body bound
- timeout/retry/cancel
- secret storage
- dependency audit
- log redaction
- privacy payload audit

---

## H. Final Docs / README

README 核心描述：

# 梁标

`用 DSH 攒香火，投下“夯”或“拉”，共同决定今日梁子从梁工一路被夯成梁祖。`

准确说明：

- 50K Input+Output Token 默认获得 1 炷香
- 香火是个人投票库存
- 夯/拉共用库存
- 梁气 = 当前剩余香火 + 下一炷 Token 进度
- 中央梁子 = 全网投票比例状态
- 待开梁 + 梁工/梁总/梁神/梁圣/梁祖
- 全局香火 = accepted votes
- 香客 = unique successful voters

不要写：

- 排行榜
- winner
- #1 梁位
- 梁签
- 个人五态
- 第三选项

Trust claim 必须与 `docs/075-backend-decision.md` 完全一致。

创建/更新：

- `README.md`
- `CHANGELOG.md`
- `RELEASE_CHECKLIST.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/100-release-readiness.md`
- `docs/101-threat-model.md`
- `docs/102-known-limitations.md`
- `docs/103-test-matrix.md`
- `docs/PRIVACY.md`
- `docs/SECURITY.md`
- `docs/DATA_FLOW.md`
- `docs/INSTALL.md`
- `docs/TROUBLESHOOTING.md`
- `docs/COMPATIBILITY.md`

---

## I. Full Verification

跑完整：

- typecheck
- lint
- unit tests
- domain tests
- frontend/component tests
- backend tests
- transaction/concurrency tests
- integration tests
- e2e
- build
- package/pack
- package content audit

clean DSH profile smoke：

1. install RC
2. launch WebUI
3. 今日梁位入口
4. 打开今日梁案
5. 0 票 WAITING
6. Token 增长
7. 获得第一炷香
8. LiangQi ring/intensity 正确
9. 投夯
10. 投拉
11. repeated vote
12. remaining 下降
13. token ring progress 不因投票回退
14. snapshot ratio 更新
15. 梁子按 threshold 变化
16. global/person state 解耦
17. multiple tab race
18. network retry/idempotency
19. day rollover（自动化/fake clock 可）
20. unload/uninstall clean

修复所有 Blocker/High。
Medium 若不修，必须明确记录 known limitation 且不影响冻结产品不变量/安全。

---

## J. Local Release Candidate

生成本地 RC tarball/package。

记录：

- Liangbiao version
- git commit
- tested DSH commit
- Node
- pnpm
- OS/browser
- host entry
- client entry
- Token Meter seam
- authority mode

禁止发布到远端。

完成最后一次 read-only mental/final review，输出：

- Release Blockers
- High
- Medium
- Low
- Accepted Limitations
- Missing Tests
- Final Go/No-Go

如果 Blocker/High 是可修的，先修、重跑再得出最终 Go/No-Go，不要只报告。

最终 commit，例如：

`chore: prepare Liangbiao v0.1 release candidate`

最后只输出：

- RC path
- authority mode
- tested DSH commit
- test summary
- fixed Blocker/High summary
- remaining limitations
- Final Go/No-Go
- final commit hash

然后停止，不 publish、不 push、不 deploy。
```

---

# END
