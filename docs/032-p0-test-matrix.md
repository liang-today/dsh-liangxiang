# 032 — P0 测试矩阵（Prompt 1 覆盖情况）

运行方式：`pnpm run test`（vitest）。本阶段 13 个测试文件全部通过。矩阵与 `LIANGBIAO_CURSOR_MASTER_R3.md` §23 对齐；标注"P2"的行属于下一里程碑（真实 Token / Fake authoritative service / 并发幂等）。

## Token / 香火（§23.1）

| 用例 | 期望 | 测试 |
|---|---|---|
| 0 | earned 0, remainder 0, toNext 50,000, fill 0 | `domain-token.spec.ts` |
| 49,999 | earned 0, remainder 49,999, toNext 1, fill 99.998% | 同上 |
| 50,000 | earned 1, remainder 0, toNext 50,000 | 同上 |
| 99,999 | earned 1, toNext 1 | 同上 |
| 100,000 | earned 2 | 同上 |
| 397,000 | earned 7, remainder 47,000, toNext 3,000, fill 94% | 同上 |
| 500,000 / 1,000,000 | earned 10 / 20 | 同上 |
| DSH 桶 fixture：uncached 10k + cacheRead 20k + cacheWrite 5k + output 15k | input 35k, effective 50k, earned 1 | 同上 |
| cache 桶全额（无 10% / 不丢 cacheWrite） | 40k+10k = 50k = 1 炷 | 同上 |

## 个人香火池（§23.2）

| 用例 | 期望 | 测试 |
|---|---|---|
| earned 7 / used 2 | remaining 5 | `domain-incense.spec.ts` |
| earned 5 / used 2 → 投 1 票 | used 3, remaining 2 | 同上 |
| 5 炷连投 5 次 | 全部成功；第 6 次 `insufficient_incense` | 同上 + `client-store.spec.ts` |
| 夯/拉混投 up/down/up… | 合法，共用一池 | `client-store.spec.ts` |
| used > earned | `used_exceeds_earned` | `domain-incense.spec.ts` |

## 梁气（§23.3）

| 用例 | 期望 | 测试 |
|---|---|---|
| remaining 5 + remainder 47,000 | fill 94%、toNext 3,000、右翼可见 `3K 当量`（精确值在 SR） | `domain-incense` + `client-panel.spec.tsx` |
| 投一票 | remaining 5→4、intensity 下降、remainder/fill/toNext 不变 | `domain-incense` + `client-store` |
| 再 +3,000 Token | earned+1、remaining+1、fill 94%→0、toNext 50,000、凝香反馈 | `client-store.spec.ts` |
| intensity | 0 炷→0；单调、有界 ≤1；非业务 Tier | `domain-incense.spec.ts` |

## 梁子 WAITING + 五态（§23.4）

零票 waiting；覆盖 0% / 49.999% / 50% / 69.999% / 70% / 84.999% / 85% / 94.999% / 95% / 100%；ratio 级同边界；非法阈值策略（重叠/越界/缺口/降序）拒绝。→ `domain-liangzi.spec.ts`

## 全局/个人解耦（§23.5）

remaining 0 + 全局 96% ⇒ 梁祖；remaining 100 + 65% ⇒ 梁总；个人 Token 397k→447k→497k 全局快照不变；全局 10→96% 个人梁气不变。→ `domain-independence.spec.ts`、`client-store.spec.ts`

## 阈值穿越（§23.6）

84.2105%→85%（16/3 +1 up = 17/20）梁神→梁圣；94.7368%→95%（18/1 +1 up = 19/20）梁圣→梁祖；穿越原因是全局比例（个人仅 remaining -1、fill 不变）。→ `domain-independence.spec.ts`、`client-store.spec.ts`

## 快照一致性（§23.12）/ 零票（§23.13）

ratios 与 liangziState 同快照自洽（含 68/32 ⇒ 68% 梁总类组合）；0/0 ⇒ null/null + waiting、UI `--`。→ `domain-global.spec.ts`、`client-panel.spec.tsx`

## 非法输入

negative / NaN / Infinity / 非整数 / 溢出 / used>earned / 非法 voteType（含 `稳`）/ 非法 requestId / 非法 businessDate / 非法 case status 全部 fail-safe。→ 各 domain spec

## UI 结构（Prompt 1 §B 验收）

四区顺序 case/core/vote/social、仅两个投票按钮（夯：升梁！/拉：降梁！，等宽标齐）、dialog 标题今日梁案、梁位与梁祖同快照、环居中且两翼 overlay、零票 `--`+待开梁、remaining 0 双按钮 `aria-disabled` 且点击只走本地搞怪反馈、六态头像两两视觉不同、三界香火 / 五行香客 / 上达天听同行、case 区居中且无可见「本地演示」徽标。→ `client-panel.spec.tsx`、`badge.spec.tsx`

## 梁位显示：单值、带小数、不越阈值

474/501 = 94.6107% ⇒ 显示 `94.610778%` 且头像仍梁圣（四舍五入会印出看似跨阈值的 `95%`）；任意小数位均截断；1000 票全枚举证明显示值恒落在所在状态区间内；零票 `--`；`10,665→10,666` 一票即改变打印值；区间文案 `85% ≤ 夯率 < 95%` 由阈值策略推导。→ `domain-liangzi.spec.ts`、`client-panel.spec.tsx`

## Region 2 新布局与自由放置

左翼今日生成香火、右翼可见 `3K 当量`（精确值 3,000 在 SR；权重表含 Pro ×1 / 其它均 ×0.5）、环底 `梁位 83.021952% → 梁神`。9 炷画 9 根香柱；23 炷 = 3 炷 + 2 月牙分轨；105 = 5 炷 + 1 日轮；≥1000 用环上 compact chip。徽章点击区 48px、人物 42px、静止底座不参与弹跳；坐标夹回可视区、面板在右边缘翻转水平对齐。→ `client-panel.spec.tsx`、`badge.spec.tsx`、`domain-compact-count.spec.ts`

## 近实时快照

默认 1s cadence：投票后推进 1s 即发布新 sequence（`total_incense` 立刻反映）；快照历史有界（`pruneSnapshots` 只留最新 N 条且不影响最新行）；个人余额被外部改动（另一标签/另一 Host）时，Host 在 5 个 tick 内经 `/v1/me/daily-state` 收敛。→ `backend-service.spec.ts`、`host-backend.spec.ts`

## Phase 3 服务层（在线 DEV_STAGING_ONLY）

Token 边界 0/49,999/50,000/99,999/100,000/397,000/500,000/1,000,000 经 `/v1/token-claims` 折算；claim 单调 ratchet（更小值不回退余额）；异日 claim 被忽略。→ `backend-service.spec.ts`

一票一炷且 token 进度不回退；重复/混投至耗尽后第 6 次 `insufficient_incense`；同 `request_id` 重放不二次扣香、异载荷 `idempotency_conflict`、幂等域按 installation 隔离；香客首票只 +1；未知/已关闭 case 被拒；store 层直呼扣香第二次返回 false。→ `backend-service.spec.ts`

**并发超投**：remaining=1、100 个不同 `request_id` 并发 ⇒ 恰好 1×200 + 99×409；20 个同 id 并发 ⇒ 全 200 且 `used_incense=1`；两标签抢最后一炷 ⇒ 1 成功。→ `backend-http.spec.ts`、`host-backend.spec.ts`、`scripts/smoke-online.sh`（50 并发）

**多标签收敛**：同 installation 顺序消费 3 炷 → 2/1/0 → 第 4 次 409；不同 installation 互不影响。→ `backend-http.spec.ts`

**边界与信任**：缺失/畸形安装头 401；投票体带 `remaining_incense` 等权威字段 400（字段路径可断言）；第三态 `steady` 400；未知路由 404 / 错误方法 405 / 限流 429；`VERIFIED_PRODUCTION` 启动被拒。→ `backend-http.spec.ts`

**快照 cadence 与版本**：投票后个人余额立即变、公共 sequence 不变；cadence 到点后 sequence+1 且比例/状态同版本；零票发布 `null/null + waiting`；个人 claim 暴涨不改梁子状态；跨进程帧的 `liangzi_state` 与同帧计数不符时**拒收**。→ `backend-service.spec.ts`、`host-backend.spec.ts`、`shared/backend-v1.ts` 校验器

**日切**：新案/旧案关闭/个人归零/昨日聚合不泄漏/旧 case id 被拒/业务日只由服务器时钟+时区决定。→ `backend-service.spec.ts`、`host-backend.spec.ts`

**Host↔Backend E2E**：DSH 四桶用量（10k+20k+5k input & 15k output = 50k）→ claim → 1 炷 → 投票 → wire 帧（`DEV_STAGING_ONLY`）→ 浏览器视图。→ `host-backend.spec.ts`、`scripts/smoke-online.sh`

## 留待 P2（本矩阵中尚未覆盖）

- 真实 DSH 映射端到端（projection → effective）在**多会话/replay/restart** 下的长跑验证。
- 跨进程（多个 DSH Host 共享一个 DB 文件）的并发压测；目前并发覆盖同进程 + WAL 语义分析。
- 反女巫 / 真实身份 / 可验证 Token：A3 下不可实现，属生产阻塞项（[`075`](075-backend-decision.md)）。
