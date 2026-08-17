# RELEASE_CHECKLIST

本地 RC 与社区 soft-trust 部署共用。仍不 `npm publish`、不建 GitHub
Release；社区后端更新只能使用 `scripts/deploy.sh`，并保持
`DEV_STAGING_ONLY` 诚实标注（[`docs/075`](docs/075-backend-decision.md)）。

## 1. 契约

- [ ] `AGENTS.md` §17 的语义自检逐条为「是」
- [ ] 语义扫描无废弃概念（稳/第三态、candidate/ranking/leaderboard/winner、大夯…大拉、LiangScore、梁签、小难梁/老梁、个人 Avatar Tier、cacheRead×0.1）；“牢梁”仅允许存在于待开梁肖像装饰牌匾
- [ ] 五态恰为 梁工/梁总/梁神/梁圣/梁祖 + `待开梁` 零票占位
- [ ] 投票恰为 夯/拉，共用一个香火池，一票一炷

## 2. 质量门

- [ ] `pnpm run verify`（typecheck + lint + test + build）全绿
- [ ] `pnpm run smoke:clean-profile`（干净 profile 装 tarball → 启动 → 断言 bundle/boot/host）
- [ ] `pnpm run smoke:online`（拒绝 VERIFIED_PRODUCTION、claim 折算、幂等、50 并发只 1 票、快照发布）
- [ ] `node scripts/assert-profile-modules.mjs <profile>`（每个 in-box 包单实例）
- [ ] `pnpm audit --prod` 无已知漏洞
- [ ] 打包内容审计：仅 `lib/index.js`、`lib/client.js(.map)`、`cordis.patch.yml`、`README.md`、`LICENSE`、`package.json`
- [ ] 分发包不含社区口令、API key、`.env` 或其他凭据
- [ ] 12k 一次性安装标识洪泛后 limiter 活跃 key 不超过硬上限，拒票/重放日志按原因采样

## 3. 信任表述

- [ ] README / docs / UI 文案与 `docs/075` 完全一致
- [ ] 无 verified / secure / cryptographic / 可信全网 之类表述
- [ ] 面板 `data-liangxiang-authority` 与屏幕阅读器摘要播报真实模式
- [ ] 后端启动横幅明确 soft trust；`VERIFIED_PRODUCTION` 启动被拒

## 4. 文档

- [ ] `CHANGELOG.md` 有本次条目
- [ ] `docs/100-release-readiness.md` 记录本次 RC 的环境与结论
- [ ] `docs/102-known-limitations.md` 覆盖所有未修项
- [ ] `docs/COMPATIBILITY.md` 的实测环境表已更新（含 tested DSH commit）

## 5. RC 产物

- [ ] `pnpm pack` 生成 tarball，记录 SHA256
- [ ] 记录：梁相版本、git commit、tested DSH commit、Node、pnpm、OS/浏览器、host entry、client entry、Token Meter seam、authority mode
- [ ] 干净 profile 装该 tarball 后手工过一遍 20 步冒烟（见 `docs/100`）

## 6. 收尾

- [ ] 提交（用户明确要求本仓每次改动都提交并推送到 GitHub；这与「不 publish/不 deploy」不冲突）
- [ ] `scripts/deploy.sh` 部署并由 `scripts/deploy-check.sh` 确认 VERSION、服务名与当前提交一致
- [ ] Mac 与树莓派先卸载旧 `dsh-liangxiang`，再安装 `dsh-liangxiang`；核对旧安装身份已迁移
- [ ] 输出 Final Go/No-Go 与遗留限制
