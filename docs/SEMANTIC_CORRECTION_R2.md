# 语义纠偏记录（R2，2026-08-16）

本文记录 Prompt 1（语义纠偏 + UI + Domain）阶段对旧业务语义的全仓清查与处置结果。事实源：[`PRODUCT_FREEZE_V0.1.md`](PRODUCT_FREEZE_V0.1.md)、[`LIANGXIANG_CURSOR_MASTER_R3.md`](LIANGXIANG_CURSOR_MASTER_R3.md)。

## 清查方式

全仓（排除 `node_modules`、`.dsh-home`、master 文档自身）搜索以下旧语义词汇：

`稳 / neutral / steady / candidate / ranking / leaderboard / winner / top-n / 大夯 / 偏夯 / 胶着 / 偏拉 / 大拉 / LiangScore / Bayesian / BallotLedger / LiangBallot / 梁签 / 小难梁 / 牢梁 / 梁哥 / 老梁 / AvatarTier / nextTier / incenseToNextTier / cacheRead * 0.1 / priorHang / priorLa / 一人一票`

> 2026-08-17 品牌复核例外：这里记录的是当时对“牢梁作为业务状态”的清查。“牢梁”现在仅允许作为 `WAITING / 待开梁` 肖像内的装饰牌匾，不得进入状态枚举、可见标签或数据模型；五态肖像内与权威状态同名的胸牌同样允许。

## 发现与处置

| 位置 | 发现的旧语义 | 处置 |
|---|---|---|
| `AGENTS.md` | （无——启动本阶段前已被替换为 R3 版本，含新冻结不变量与禁止词清单） | 保留，作为最高优先级仓库规则 |
| `README.md` | "折算为梁气、铸造梁签"产品描述 | 重写为香火/夯拉/全网五态/个人梁气模型 |
| `docs/002-architecture.md` §1 | 旧产品回顾（梁签/铸造） | 重写 |
| `docs/002-architecture.md` R5 | `effectiveTokens = uncachedInput + output + floor(cacheRead*0.1)`，cacheWrite 0 权重，per-request cap | 改为 `input(三桶全额) + output`，废弃 cap |
| `docs/002-architecture.md` R6/R7 | `tokensPerBallot`、整除铸梁签、"梁案切换清零梁气与梁签" | 改为 `tokenPerIncense`、remainder 即环进度、business date 切换语义 |
| `docs/002-architecture.md` §4.2/§4.3 | 存储表含"未用梁签数"；vote payload `{idempotencyKey, direction}`、"一票消耗一梁签" | 改为香火账目表；payload `{caseId, voteType: "up"/"down", requestId}`、一票一炷 |
| `docs/002-architecture.md` §6 | 方案 A（目标模型口径）为默认 | V0.1 冻结无目标模型过滤；采用投影差分观测通道 |
| `docs/002-architecture.md` §8/§9 | `direction: 'hang'|'la'`、"token→梁签"软信任、wire 快照含梁签 | 改为 `voteType: 'up'|'down'`、香火语义 |
| `docs/001-dsh-integration-spike.md` | Q12 标题/Q13 注解使用"梁签/铸造"；方案 A 注解 | DSH 技术事实有效，文首加 R2 换读提示（历史勘察文档不改写证据） |
| `docs/004-open-risks.md` | R-6/R-12 使用梁签、tokensPerBallot、目标路由集 | 文首加 R2 换读提示 |
| `src/domain/index.ts` | 占位注释"梁气/梁签/ballot minting" | 被真实 domain 实现替换 |
| `src/shared/index.ts` | （无旧语义，仅缺新文案常量） | 增补 今日梁案/夯/拉/香火/香客/五态标签 |
| `src/client/Badge.tsx` | 注释提及"香火环…后续里程碑"（非旧模型） | 被正式实现替换 |
| `tests/*` | mock 数据无旧业务语义 | 按新模型全面重写/扩充 |

## 专项确认

- **未发现** personal earned → avatar 的实现（骨架期无业务代码）。
- **未发现** "global ratio 不得改变 avatar" 旧测试。
- **未发现** "梁气不可下降" 旧逻辑。
- **未发现** 第三投票选项 / ranking / winner / candidate 模型。
- 旧 cacheRead×0.1 / 梁签模型只存在于文档（`docs/002` 等），已如上处置，代码中从未实现。

## 保留的通用骨架（未动）

- 双半打包结构：`package.json`（dsh.bundle + dsh.client）、`cordis.patch.yml`、`tsdown.config.ts`（浏览器 CJS factory 包装复刻）。
- `compat/dsh` 适配层：`host-context.ts`、`client-context.ts`、`overlay-slot.ts`（shell.overlay 注册）。
- Host 生命周期 effect、脚本（dev-install/dev-web/smoke-clean-profile 等）、docs/000–004 的 DSH 技术事实。
