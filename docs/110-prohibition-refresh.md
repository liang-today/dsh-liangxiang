# 110 — 原始禁令 vs 当前实现（待你一键决策）

> 活契约永远是根目录 [`AGENTS.md`](../AGENTS.md)。本页只列**原始 Prompt / PRODUCT_FREEZE / MASTER 文案**与**当前代码**的差异，方便一次性决定要不要把那些「原始禁令」改写成现状。
>
> **本回合已落地、不再问你的两项：**
> 1. 每次改完自动 `git commit` + `git push`（覆盖 Prompt 4/11「禁止 git push」）
> 2. 投票按钮文案 `夯：升梁！` / `拉：降梁！`，两钮等宽标齐

回答方式：在对话里点下面选项即可。选「全部刷新」会改 `PRODUCT_FREEZE_V0.1.md` 与 `LIANGBIAO_CURSOR_MASTER_R3.md` 里对应的过时段落，使它们与 `AGENTS.md` 一致。选「保持原文」则原文当历史快照保留，冲突时仍以 `AGENTS.md` 为准。

---

## A. 仍然有效（不建议动）

这些是安全/信任红线，实现也遵守。刷新文档时**应原样保留**。

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

---

## B. 已被后续指令覆盖，原文还停在旧禁令（候选刷新）

| # | 原始禁令 / 冻结文案 | 当前实现（AGENTS.md 已写） | 原文位置 |
|---|---|---|---|
| 1 | 「禁止 git push」 | **每次改完必须 push** | MASTER Prompt 11 §禁止自动；Prompt 4 同文 |
| 2 | Region 2 = `夯% \| 梁子 \| 拉%` | `我的香火 \| 居中梁子+环 \| 下一炷`，环下单值梁位 | MASTER Region 2；PRODUCT_FREEZE §四个视觉区域 |
| 3 | 「再 N Token 必须整合进梁气环内」 | 数字拆到环左右两翼 overlay；环本身只承载 fill/intensity/香火点 | PRODUCT_FREEZE 梁气节；MASTER 4255 行附近 |
| 4 | 徽章固定右缘、图标是「梁」字 | 可拖拽；图标=当前梁子五态头像 | MASTER 入口节 |
| 5 | 快照 cadence 300s、无每票广播 | 默认 1s；投票在**同一事务内发布快照**并随响应带回 | MASTER §12 |
| 6 | 可见「本地演示」徽标 | 已去掉；软信任走 `data-liangbiao-authority` + SR | 早期 UI Prompt |
| 7 | 按钮主文案 `夯！` / `拉！`（升梁/降梁仅「可后续附属小字」） | **主文案就是** `夯：升梁！` / `拉：降梁！` | MASTER Region 3；PRODUCT_FREEZE |
| 8 | 梁位 4 位小数 | **6 位**截断 | AGENTS 曾写 4；代码 `LIANG_POSITION_DECIMALS = 6` |
| 9 | Prompt 4「本阶段不新增产品功能」 | V0.1 RC 之后仍在按你的指令改 UI/文案 | MASTER Prompt 4 开头 |
| 10 | 零票 UI「左右 `--`」 | 左右已不是夯/拉比例，零票只在梁位药丸显示 `--` | MASTER §23.13 |

---

## C. 建议的两种刷新粒度

**全部刷新（推荐，若你希望原始文档不再误导下一轮 agent）：**

- 改 `docs/PRODUCT_FREEZE_V0.1.md` Region 2/3、梁气整合句、按钮文案
- 改 `docs/LIANGBIAO_CURSOR_MASTER_R3.md` 冻结 UI、Prompt 4/11「禁止 git push」→「禁止 npm publish / Release / 公网部署 / 改真实 profile；git push 为站立指令」
- 明确 Prompt 4「不新增产品功能」只约束当时那一阶段，不约束后续对话

**保持原文当历史：**

- `AGENTS.md` 继续赢
- MASTER / PRODUCT_FREEZE 加一句「与 AGENTS.md 冲突时以 AGENTS.md 为准」（PRODUCT_FREEZE 已有类似声明）
- 风险：下一轮 agent 若先读 MASTER Prompt，可能再次把 Region 2 改回夯%/拉%、再次拒绝 push

---

## D. 本回合未改动的原文

在你点选之前，**没有**改 MASTER 与 PRODUCT_FREEZE。实现与 `AGENTS.md` / `docs/020` 已对齐当前设计。
