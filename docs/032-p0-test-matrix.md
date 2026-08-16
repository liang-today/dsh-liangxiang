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
| remaining 5 + remainder 47,000 | fill 94%、toNext 3,000、环内 `5 炷 · 再 3,000 Token` | `domain-incense` + `client-panel.spec.tsx` |
| 投一票 | remaining 5→4、intensity 下降、remainder/fill/toNext 不变 | `domain-incense` + `client-store` |
| 再 +3,000 Token | earned+1、remaining+1、fill 94%→0、toNext 50,000、凝香反馈 | `client-store.spec.ts` |
| intensity | 0 炷→0；单调、有界 ≤1；非业务 Tier | `domain-incense.spec.ts` |

## 梁子 WAITING + 五态（§23.4）

零票 waiting；整数票组合覆盖 0% / 59.999% / 60% / 69.999% / 70% / 79.999% / 80% / 89.999% / 90% / 100%；ratio 级同边界；非法阈值策略（重叠/越界/缺口/降序）拒绝。→ `domain-liangzi.spec.ts`

## 全局/个人解耦（§23.5）

remaining 0 + 全局 92% ⇒ 梁祖；remaining 100 + 65% ⇒ 梁总;个人 Token 397k→447k→497k 全局快照不变；全局 55→95% 个人梁气不变。→ `domain-independence.spec.ts`、`client-store.spec.ts`

## 阈值穿越（§23.6）

79.x%→80%（79/20 +1 up = 80/100）梁神→梁圣；89.x%→90% 梁圣→梁祖；穿越原因是全局比例（个人仅 remaining -1、fill 不变）。→ `domain-independence.spec.ts`、`client-store.spec.ts`

## 快照一致性（§23.12）/ 零票（§23.13）

ratios 与 liangziState 同快照自洽（含 68/32 ⇒ 68% 梁总类组合）；0/0 ⇒ null/null + waiting、UI `--`。→ `domain-global.spec.ts`、`client-panel.spec.tsx`

## 非法输入

negative / NaN / Infinity / 非整数 / 溢出 / used>earned / 非法 voteType（含 `稳`）/ 非法 requestId / 非法 businessDate / 非法 case status 全部 fail-safe。→ 各 domain spec

## UI 结构（Prompt 1 §B 验收）

四区顺序 case/core/vote/social、仅两个投票按钮（夯！/拉！）、dialog 标题今日梁案、83%/17% 与梁圣同快照、`5 炷 · 再 3,000 Token` 整合在环组件内、零票 `--`+待开梁、remaining 0 双按钮 disabled + 可访问 reason、六态头像两两视觉不同、香火 12,846 / 香客 2,841（`🪔`/`🙏` 图标 + 15px 文案）、case 区居中且无可见「本地演示」徽标（软信任标注在 `data-liangbiao-authority` + SR 摘要）。→ `client-panel.spec.tsx`、`badge.spec.tsx`

## 百分比显示不越阈值

449/52 = 89.6% ⇒ 显示 `89%` / `11%` 且头像仍梁圣（四舍五入会印出看似跨阈值的 `90%`）；1000 票全枚举证明显示值恒落在所在状态区间内；两侧恒和 100%；零票双 `--`；区间文案 `80% ≤ 夯率 < 90%` 由阈值策略推导。→ `domain-liangzi.spec.ts`、`client-panel.spec.tsx`

## 留待 P2（本矩阵中尚未覆盖）

- 真实 DSH 映射端到端（projection → effective）、replay/restart 不重复、multi-session 聚合、day rollover。
- 并发超投（remaining=1 并发 N）、request_id 幂等执行、香客首票 +1 的服务层实现、多 tab 收敛。
