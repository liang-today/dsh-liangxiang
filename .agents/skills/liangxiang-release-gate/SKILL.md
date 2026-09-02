---
name: liangxiang-release-gate
description: Audit and coordinate a major Liangxiang public release across the plugin repository, community backend, npm, GitHub Release, and liang.today Pages. Use when preparing, approving, publishing, or verifying a public release; do not use for ordinary commits or an internal backend-only maintenance update.
---

# 梁相正式发布门禁

正式发布必须产出一份可复核的上线回执。任何一项未通过，就不能发布 npm、创建 GitHub Release、部署正式后端或更新公开官网。

## 权限与停止条件

- “准备发布”只授权只读检查、必要的本地修复、测试、文档更新以及仓库规定的修复 Commit/Push，不授权公开发布。
- 合并或推送公开 `main`、正式后端部署、npm publish、GitHub Release/Tag、GitHub Pages 上线，均在回执完成后等待用户对具体目标的明确批准。
- npm 发布优先把准确命令交给用户手动执行，以便完成登录和 2FA；只有用户明确要求代发时才可执行。
- 梁相只为有实质用户价值的成批更新做正式发布，不因每个修复 Commit 重发 npm 或 GitHub Release。
- 审计后若候选 Commit、依赖、发布文案、服务器或官网发生变化，重跑受影响的门禁。

## 固定范围

- 插件、客户端与社区后端：当前 `dsh-liangxiang` 仓库。
- 官网与 GitHub Pages：相邻 `../liang-xiang-page` 仓库。
- DSH 兼容参考：相邻 `../deepseek-harness`，只读，除非用户另行授权。
- 宣传视频和周边仓只有在本次会公开分发或引用其产物时才纳入发布范围；不得把旧测试目录误当正式来源。

## 1. 候选版本与来源一致性

1. 确认两个发布仓工作区干净、远端已取回、候选 Commit 已推送，并记录分支、完整 SHA 与默认分支差异。
2. 从 npm、GitHub Releases/Tags 和官网确认上一正式公开版本，不能只相信本地文档。
3. 检查 `package.json.version`、`PLUGIN_VERSION`、`RELEASE_NOTES_VERSION` 完全一致；`SERVER_BUILD` 必须以该客户端版本为前缀。
4. 检查 README、安装文档、兼容性索引、更新弹窗、CHANGELOG、官网展示版本和安装命令互不矛盾。
5. 构建最终 tarball 并检查包内文件、包名、版本、入口、README、许可证和 sourcemap/开发残留；待发布产物必须能追溯到同一候选 Commit。

## 2. 隐私与敏感信息

同时检查主仓和官网仓的当前源码、所有可见分支/Tag 历史、Commit 信息、GitHub Release 文案与附件，以及将要上传的 npm/GitHub Pages 产物。至少覆盖：

- 密钥、Token、Cookie、入梁券、API Key、私钥、`.env` 内容和真实凭据；
- 个人姓名、私人邮箱/电话、个人用户名、绝对用户目录和其他可识别个人信息；
- 服务器公网 IP、SSH 命令、内部端口、后台路径、运维账户和未公开基础设施信息；
- 调试日志、数据库、备份、会话、源码路径、测试凭据和 sourcemap 中的本机信息。

只报告脱敏后的类型、仓库、文件/记录位置和处置建议，不在回执中复制完整秘密。历史曾公开真实凭据属于阻断项，需要轮换凭据；历史隐私或 IP 是否改写 Git 历史必须交由用户决定，不能擅自强推。

## 3. 本地、候选包与正式后端

1. 比较源码版本、打包 tarball、开发 Profile 和全新临时 Profile 的实际加载版本。
2. 只读核对正式服务器的健康状态、`VERSION`、服务构建号、数据库 schema、迁移状态和当前运行 Commit；不得在检查阶段写正式数据或投测试票。
3. 运行仓库规定的部署一致性检查。最终发布要求正式后端部署 SHA 与获批候选 SHA 一致，且健康检查通过。
4. 若不一致，标记为“待授权部署”，不能把本地最新误报成线上最新；正式部署只能使用仓库规定的部署脚本。

## 4. DSH 与模型当量

1. 查看当前锁定 DSH 的准确 Tag/Commit、官方最新 Release/npm dist-tag 和模型注册源码，不凭记忆判断。
2. 列出 DSH 当前实际路由的精确模型 ID，核对 `compat/dsh` 适配证据以及用量桶、推理 Token、增量/最终事件语义是否变化。
3. 核对当量映射：已验证 Pro 路由为 `×1`，Flash 为 `×0.5`；未知、缺失和其他模型保持安全回退 `×0.5`，除非官方证据支持新增精确映射。
4. 若 DSH 出现新版本、新模型 ID 或用量语义变化，先更新适配、文档和回归测试，再重新开始发布门禁。

## 5. 功能与安装质量

- 运行完整 typecheck、lint、单元、后端、迁移、幂等、并发、构建和客户端体积检查。
- 使用构建出的 tarball 在全新临时 DSH Profile 进行真实安装和浏览器测试，覆盖桌面、窄屏、亮暗主题、键盘、无障碍与 reduced-motion。
- 覆盖首次欢迎 → 更新说明 → 正式使用，以及案牍版本入口复用同一更新说明；二维码和发布文案必须来自安装包而非源码开发服务器。
- 覆盖单炷、混合方向、长按倾炉、空炉、边界值、广播退出、案牍菜单、模式确认、梁祠和重连；会改变正式数据的验证只能在隔离后端进行。
- 官网运行其完整检查与生产构建，核对安装指令、下载入口、站内链接、移动端、隐私声明和缓存后的公开页面。

## 6. 更新说明

读取并执行相邻的 `../liangxiang-release-notes/SKILL.md`。更新说明必须汇总上次正式版以来的用户收益，主列表 3–4 条，不展示后台安全、迁移、测试或 Commit 级施工记录。向用户展示最终文案并明确写出“更新日志已按标准检查”。

## 上线回执

回执逐项给出 `通过 / 阻断 / 待授权`、关键证据和准确版本/SHA，并单列：

- 上一公开版本与本次候选版本；
- 主仓、官网仓、本地包、正式后端和 DSH 基线；
- 隐私扫描范围与脱敏发现；
- 自动测试、人工视觉检查及未覆盖项；
- 发布后回滚点；
- 需要用户批准的每个外部动作。

全部技术门禁通过后，仍应停下等待批准。获批后的推荐顺序是：公开主仓 `main` → 正式后端部署并复核 → npm 发布并从 registry 全新安装复核 → 同一 Commit 创建 GitHub Tag/Release → 官网 `main`/Pages 更新 → 线上只读复核。任何一步失败即停止后续步骤并报告，不用新版本或新 Commit 绕过失败。
