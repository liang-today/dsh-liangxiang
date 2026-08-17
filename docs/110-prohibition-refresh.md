# 110 — 原始禁令 vs 当前实现

> 活契约永远是根目录 [`AGENTS.md`](../AGENTS.md)。
>
> **2026-08-16 决策：全部刷新。** `PRODUCT_FREEZE_V0.1.md` 与 `LIANGXIANG_CURSOR_MASTER_R3.md` 的过时段落已回写成与 `AGENTS.md` / 当前实现一致。

## 已落地的站立指令

1. 每次改完自动 `git commit` + `git push`（覆盖 Prompt 4/11「禁止 git push」）
2. 投票按钮文案 `夯 · 升梁` / `拉 · 降梁`，两钮等宽标齐
3. 梁子 / 环 / 香火点必须落在面板水平中线；个人两翼 overlay

## A. 仍然有效（安全红线，未改）

| 禁令 | 现状 |
|---|---|
| 不 `npm publish` | 遵守 |
| 不 GitHub Release | 遵守 |
| 不公网 production deploy | 遵守 |
| 不改用户真实 DSH profile | 遵守 |
| 不改 `../deepseek-harness` | 遵守 |
| 不声称 verified / secure / 可信全网 | 遵守；`VERIFIED_PRODUCTION` 启动即拒 |
| 不把 DSH anonymous UUID 当认证身份 | 遵守；自铸 `installation_id` |
| 不把 Host `tokenUsage` 当服务端可验证 Token | 遵守；`claim_verified: false` |
| 投票体最小：`case_id` / `vote_type` / `request_id` | 遵守 |
| 客户端不得自报 user_id / tokens / incense / 梁子状态 | 遵守 |
| 投票仍只有 `up`/`down`（无第三选项） | 遵守；升梁/降梁只是按钮文案 |
| 不用 `localStorage` 当票权账本 | 遵守；只记徽章位置 |
| 不确定重试不得换新 `request_id` | 遵守 |
| domain 层不依赖 React / DSH / 网络 / DB | 遵守 |

## B. 已回写到 MASTER / PRODUCT_FREEZE 的覆盖项

| # | 原文 | 现文 |
|---|---|---|
| 1 | 禁止 git push | 每次改完必须 push |
| 2 | Region 2 = `夯% \| 梁子 \| 拉%` | `今日凝香 \| 居中梁子+环 \| 下一炷` + 单值梁位 |
| 3 | 再 N Token 必须写进环内 | 左右两翼 overlay；环居中 |
| 4 | 徽章固定右缘、「梁」字 | 可拖拽；图标=当前梁子五态 |
| 5 | 快照 cadence 300s / 5min | 默认 1s；投票事务内发布快照 |
| 6 | 按钮 `夯！` / `拉！` | `夯 · 升梁` / `拉 · 降梁` |
| 7 | 梁位 4 位小数 | 6 位截断 |
| 8 | Prompt 4「本阶段不新增产品功能」 | 只约束当时那次 RC 审计 |
| 9 | 零票「左右 `--`」 | 梁位药丸 `--`；左右仍是个人香火 / 下一炷 |
