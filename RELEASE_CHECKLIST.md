# RELEASE_CHECKLIST

本地 RC 与社区 soft-trust 部署共用。`npm publish` 与 GitHub Release 只有在
运营者明确下达发布指令后才执行；社区后端更新只能使用 `scripts/deploy.sh`，并保持
`DEV_STAGING_ONLY` 诚实标注（[`docs/075`](docs/075-backend-decision.md)）。

## 1. 契约

- [ ] `AGENTS.md` §17 的语义自检逐条为「是」
- [ ] 语义扫描无废弃概念（稳/第三态、candidate/ranking/leaderboard/winner、大夯…大拉、LiangScore、梁签、老梁、个人 Avatar Tier、cacheRead×0.1）；“牢梁”仅允许存在于待开梁肖像装饰牌匾
- [ ] 当前规则六态为 小难梁/梁工/梁总/梁神/梁圣/梁祖 + `待开梁` 零票占位；历史梁案按其原规则展示
- [ ] 投票恰为 夯/拉，共用一个香火池，一票一炷

## 2. 质量门

- [ ] `pnpm run verify`（typecheck + lint + test + build）全绿
- [ ] `pnpm run smoke:clean-profile`（干净 profile 装 tarball → 启动 → 断言 bundle/boot/host）
- [ ] `pnpm run smoke:online`（拒绝 VERIFIED_PRODUCTION、claim 折算、幂等、50 并发只 1 票、快照发布）
- [ ] `node scripts/assert-profile-modules.mjs <profile>`（每个 in-box 包单实例）
- [ ] `pnpm audit --prod` 无已知漏洞
- [ ] 打包内容与 `package.json.files` 一致：Host／Client入口、必要画像资源、许可证、patch、README及manifest；不得夹带Backend、数据库、测试或运维文件
- [ ] 分发包不含入梁券 secret、API key、`.env` 或其他凭据
- [ ] 最终包默认后台为 `https://api.liang.today`，Client使用DSH同源API；不含测试公网IP／临时测试入口或开发环境覆盖。localhost校验与显式自建配置单独核对，不机械删除
- [ ] 12k 一次性安装标识洪泛后 limiter 活跃 key 不超过硬上限，拒票/重放日志按原因采样

## 3. 信任表述

- [ ] README / docs / UI 文案与 `docs/075` 完全一致
- [ ] 无 verified / secure / cryptographic / 可信全网 之类表述
- [ ] 面板 `data-liangxiang-authority` 与屏幕阅读器摘要播报真实模式
- [ ] 后端启动横幅明确 soft trust；`VERIFIED_PRODUCTION` 启动被拒

## 4. 文档

- [ ] `CHANGELOG.md` 有本次条目
- [ ] 当前发布回执记录最终候选环境与结论；历史 `docs/100-release-readiness.md` 不作为2.0验收
- [ ] `docs/102-known-limitations.md` 覆盖所有未修项
- [ ] `docs/COMPATIBILITY.md` 的实测环境表已更新（含 tested DSH commit）

## 5. RC 产物

- [ ] `pnpm pack` 生成 tarball，记录 SHA256
- [ ] 记录：梁相版本、git commit、tested DSH commit、Node、pnpm、OS/浏览器、host entry、client entry、Token Meter seam、authority mode
- [ ] 干净 profile 装该 tarball 后手工过一遍 20 步冒烟（见 `docs/100`）

## 服务器/IP/入口切换（涉及时必填，先于正式部署和流量切换）

- [ ] 按[`换服前置门禁`](docs/121-vps-deploy.md#0-换服前置门禁中国大陆可用性)在独立入口、独立测试库评估；正式流量仍留旧服
- [ ] 大陆多地区电信/联通/移动与晚高峰覆盖齐全，旧/新使用同批健康探针对照；未用英国或单台云机替代
- [ ] DNS/TCP/TLS/真实HTTPS业务、已认证SSE持续与重连、梁股读取和当期并发目标完成验证，信息量与行情频率未降低
- [ ] 按测试前约定的标准给出成功率、P95、错误/超时、流量及资源对照和通过/不通过结论；覆盖缺口与失败单列
- [ ] 大陆可用性验收通过且本次切换已获授权；未通过或未评估不得直接改正式DNS、反代、写入端或默认后台。已评估但存在缺口时，仅可按AGENTS中的明确风险接受例外执行，不把例外记为验收通过
- [ ] 旧服、一致备份和单写者回退已保留；切换后大陆正式域名业务复测通过，解析残留单列，未提前宣称全国恢复

## 6. 收尾

- [ ] 提交（用户明确要求本仓每次改动都提交并推送到 GitHub；这与「不 publish/不 deploy」不冲突）
- [ ] `scripts/deploy.sh` 部署并由 `scripts/deploy-check.sh` 确认 VERSION、服务名与当前提交一致
- [ ] 本机 MacBook 与至少一台独立客户端先卸载旧 `dsh-liangxiang`，再安装新包；核对更新路径保留身份，真正清空存储的重装走正式入梁券/rekey
- [ ] 输出 Final Go/No-Go 与遗留限制

## 7. 插件市场展示（发布前准备，获批发布后复核）

- [ ] 按 [`PLUGIN_MARKET_DISTRIBUTION.md`](docs/PLUGIN_MARKET_DISTRIBUTION.md) 复核既有及新增重要市场；优先DSH原生发现索引、dsh-market / awesome，其次1024及其他目录
- [ ] 分别记录搜索卡片／详情的标题、介绍、图标、图片、版本来源与刷新方式；不把只支持图标的卡片当三图画廊
- [ ] 同一正式版的主UI、梁股、梁祠三张真实图已准备，GitHub与包内README／详情、官网、人工目录文案对应；HTTPS图片可访问、清晰、无隐私或测试残留
- [ ] 检查最终tarball而非仅源码README；预发布候选与当前正式公开展示分开，不提前宣称2.0已上线
- [ ] 需要的第三方目录更新、公开素材部署和投稿已列入待批准动作；获批发布后复搜并打开详情，记录实际展示版本、核验时间和待刷新项
