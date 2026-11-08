# fork → main 与三平台 CI

源码进入 main 不等于正式发布；CI 不执行 npm、GitHub Release/Tag、Pages 或生产部署。

## 协作与检查

- 社区 main 是唯一日常集成分支；维护者与贡献者均从最新 main 在个人 fork 建分支，
  向社区 main 提 PR。PR 模板与工作流统一使用 main，不再经过 dev。
- 三平台检查验证来源是 PR 作者本人个人账号拥有的 fork，且 head 是非默认功能分支；
  拒绝主仓分支、组织 fork、他人 fork 和个人默认分支。PR head 必须包含事件的 base 与当前 main。
  GitHub 在测试合并提交上运行检查；main 更新后必须先同步并重新通过检查。
- main 保持严格分支保护、管理员受约束、禁止强推和直接推送，讨论必须解决。
  必需检查名称不变：`privacy`、`verify-locked (ubuntu-latest)`、
  `verify-locked (windows-latest)`、`verify-locked (macos-latest)`、`smoke-installed`。
- verify 固定 Node 22.23.1、pnpm 11.28.5 和已审核锁文件，运行来源/祖先门禁回归、
  部署脚本回归、类型检查、lint、完整单测、构建及客户端预算。
- 每个 main PR 都运行 smoke-installed：真实 tarball 安装、桌面/窄屏/暗色浏览器检查，
  以及隔离 Backend/Host 在线闭环。失败或跳过不能冒充通过。
- 三个浏览器项目各用独立runner、Host和临时Profile并行执行，仍在单项目内串行，
  不让多个worker争用同一账本。桌面项目另跑一次独立在线闭环；必需的同名
  `smoke-installed` 汇总门禁只有全部项目成功才通过，失败、取消或跳过均不放行。
  这保留完整三主题范围，避免全252项在单Host的15分钟步骤内串行超时。
- 所有 PR 测试仅有 `contents: read`，checkout 不保留凭据，不向 fork 暴露写入令牌或秘密。
- 浏览器基线必须覆盖真实非安全HTTP上下文：将保留测试域仅映射到隔离本机Host，
  断言 `isSecureContext=false` 及原生 `randomUUID` 缺失，再验证连续上香与市场请求。
  localhost和注入固定测试请求号不能代替这一项；权威接口在该UI用例中隔离模拟，
  丢回执、重开和原请求重放另由真实SQLite回归验证。不得通过安全豁免标志使HTTP变安全。
  管理员在全部检查通过后人工审核合并。作者无法批准自己的 PR；单维护者合并不声称独立审批。
- 个人 fork 推送与合入后的 push 不重复触发同一轮云端检查；本地验证仍必须完成。

## 自动运行与合并权限

仓库级 Actions 运行审批已设为 `first_time_contributors_new_to_github`：普通账号提交 PR、
更新提交或重新打开 PR 时自动运行，首次向本仓贡献也不再要求逐一批准。
新注册 GitHub 账号首次贡献仍可能需要人工批准；GitHub 没有全部免审批的原生选项。
这项设置不在工作流 YAML 中，修改 YAML 本身不能取消平台审批。
CI 成功后仍须维护者审核合并，不启用无人审核自动合并。

- [GitHub 的 fork 工作流审批设置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [Actions 审批策略 API](https://docs.github.com/en/rest/actions/permissions#set-fork-pr-contributor-approval-permissions-for-a-repository)

## 单一社区分支

dev 已确认完整纳入 main 后删除，本机 `upstream/dev` 跟踪引用已清理，原跟踪配置改为 main。
主仓仅保留 main；启用限制分支创建的规则集，覆盖全部社区分支，无绕过名单。
功能分支留在个人 fork；main 保留 PR、严格同步、必需检查、管理员约束及禁止强推/删除的保护。
公开仓库无法禁止 clone；规则限制的是向主仓创建、推送和合并代码的权限。
主仓的分支规则不限制个人 fork 创建功能分支；此规则不是传播至整个 fork 网络的 push ruleset。

## 上游兼容预警

`ci-compat.yml` 在相关 main PR、既有每日检查及手动触发时解析一次 DSH alpha，
将四个 DSH 包和 Cordis/group 的精确版本冻结给三平台。安装政策、白名单与供应链等待期不降低。
失败保持可见；预警不替代锁定依赖门禁，alpha 也不表示版本一定高于当前 RC。

三平台和上游兼容方向来自 @XChen446 的 PR #7，原贡献记录保留。

## 隐私门禁

- 安装 `node scripts/install-privacy-hooks.mjs`，在本地提交内容、提交说明和推送前检查；
  既有 hooks 会串联保留，同仓所有 worktree 共用门禁。提交身份使用你自己的账号，即本仓库
  配置的 `user.name` / `user.email`。Git commit／标签默认不签名，GPG／SSH 签名可选。
- 主仓 PR 必须通过 `privacy`，检查最终文件、每个新提交的说明/新增内容、作者与提交者
  邮箱，以及 PR 标题和描述。编辑描述时单独重查，不重复执行三平台验证。
- 社区 PR 使用 `--community-pr`：贡献者自愿公开的提交邮箱仅产生匿名提示，不阻断合入，
  不要求修改已有签名历史。策略中登记的维护者公开姓名/邮箱仍严格匹配；本地提交与推送
  hooks 要求提交人使用本仓库配置的身份。缺少签名、签名工具、密钥或签名者邮箱信息均不阻断；
  推送中带入的社区提交邮箱仅提示。邮箱提示不等于身份认证。
- 拦截私人工作流称呼、本机用户路径、私人会话标识、非匿名邮箱、常见凭据格式和私钥。
  社区提交元数据中的自选公开邮箱除外，文件内容和 PR 文案中的私人邮箱仍会阻断。
  Token、私钥和敏感文件强制检查不变，每个新增提交也检查敏感文件，删除后仍可发现。
  日志只报告类别，不回显命中值、文件名或上下文；规则和测试也不写入私人称呼明文。
- 公开评论或其他文案先保存临时文件，再运行 `check-privacy.mjs --message <file>`。
- 自动扫描不能识别所有自然语言细节或图片内容；维护者仍须审核隐私和门禁本身的修改。
- 已公开历史的修复需独立映射及本地备份。移除当前文字或追加修正提交不会抹去旧提交；
  受保护历史的 force 更新、标签变化和缓存移除必须单独评估，不能冒充已经彻底清除。

CI 与临时 Profile 固定 pnpm 11.28.5，以避开旧 11.7.0 在安装完成后进程不退出的问题（[pnpm #13617](https://github.com/pnpm/pnpm/issues/13617)）。这只约束隔离验收，不修改正在运行的个人开发环境；依赖安装和完整冒烟分别有步骤超时，失败保持主分支不变。

提交身份就是提交人本人：作者与提交者须为本仓库配置的 `user.name` / `user.email`。
提交和标签默认不签名（`commit.gpgsign=false`、`tag.gpgsign=false`），签名不作为提交或 PR 门槛。
不要为了通过文档、模板、示例或门禁而借用别人的账号或 noreply 地址：
`NiYa193`、`liangxiang-CI` 是历史公开身份，只用于解释既有提交，
不是现在的提交模板。已有签名与原作者归属保留，不为调整这项政策再次改写历史。
PR 审核、测试、隐私检查和其他分支保护保持必需，运行时 Ed25519 接口鉴权不变。

个人 GitHub Profile 姓名是账号级资料，不应为项目或 CI 改名；只有用户明确要求
修改这一资料项并指定目标值时，Agent 才可操作。
PR 列表中的用户名与 commit 作者/提交者元数据分别核验。GitHub 网页或 API 合并若会
带入私人姓名、且不能指定公开署名，应在执行前明确提醒用户具体需要进行的操作，
由用户决定处理方式；不得通过修改个人 Profile 解决项目署名问题。
