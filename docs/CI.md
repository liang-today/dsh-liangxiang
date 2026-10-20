# fork、dev/main 与三平台 CI

正式版目标 **1.2.0**。源码进入 main 不等于正式发布；以下任务不执行 npm、
Release、Tag、Pages 或生产部署。贡献流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 日常集成

- 社区保留 `dev`、`main` 两个长期分支；个人功能分支留在个人 fork。
- 个人 fork 不跑云端 CI，个人推送只做本地 Codex 验证；本人的 fork 已关闭 Actions。
  功能在向社区 dev 提 PR 时跑 CI，合入 dev/main 后不再重复触发同一轮 push 检查。
- PR 默认目标为 `dev`，普通 `pull_request` 在 GitHub 生成的测试合并提交上运行。
- `main` 必须是 `dev` 的祖先：日常开发时 dev 领先，批次验收后两者相同。
  三平台门禁验证这一顺序；main 的候选提交必须已经存在于 dev 历史中。
- `dev` 要求 `privacy` 与三个 `verify-locked (ubuntu-latest/windows-latest/macos-latest)` 检查；
  Node 22.23.1 / pnpm 11.28.5，锁文件安装，完整类型、lint、单元/后端、构建、体积验证。
- CI 控制器和隐私门禁另有 Node 原生测试，覆盖主线推进、批次被改、假/缺/跳过检查和清理边界。
- 管理员审核后人工合并；目前只有一位管理员，保护允许 0 个额外 Approve。
  这支持维护者自己的 PR，不代表独立审批；GitHub 禁止作者批准自己。
- main 额外要求 `smoke-installed`：Ubuntu 中真实 tarball 安装、桌面/窄屏/暗色浏览器
  与隔离 Backend/Host 在线回归。所有 smoke 只使用临时 Profile、SQLite 和 localhost。
- 两个分支均要求 PR、严格同步、管理员同样受门禁约束，禁止强推、删除，要求解决讨论。
  写入限制限定管理员；专用 App 安装后只给 main 的合并职责，不给予保护绕过。

## 每日批次

`nightly-promotion.yml` 放在默认分支 main，仅允许在社区仓 main 上运行。
每天英国当地 00:00，`timezone: Europe/London` 自动跟随 GMT/BST。GitHub 定时运行
可能延迟，尤其是整点；这是一项每日任务，不是精确到秒的定时承诺。

1. 冻结 main/dev 完整 SHA，验证 dev 已包含 main 的全部历史；不满足就停止。
   没有文件变化时直接结束，不创建分支、PR 或提交。
2. 从 trusted main 启动专用 App 控制器。短期 `automation/promote-<run>-<attempt>`
   分支直接指向冻结的 dev 提交，创建 main 验收 PR；不准备额外的批次合并提交。
3. PR 的测试合并运行三平台、隐私、完整安装、浏览器和在线检查。验证测试合并的
   双亲恰为冻结 main/dev，文件树与 dev 完全一致；只接受 Actions App `15368`
   在冻结 dev SHA 上的全部真实 success。main 变化、候选被改、失败或超时均停止。
4. 验证最新 dev 仍包含冻结提交。使用 GraphQL `updateRefs`，以冻结 main 为
   `beforeOid`、冻结 dev 为 `afterOid`、`force: false`，原子快进 main。
   保护规则继续生效，无绕过；main 在最后一刻变化也会被服务器拒绝。
   新进入 dev 的提交留给下一批，不改 dev，也不新增晋级或反向同步提交。
5. GitHub 自动将已快进的 PR 记为合并；控制器有界等待其完成登记后清理临时分支。
   失败则关闭验收 PR 后清理；分支被别人改动则拒绝删除并报错。
   PR、检查、工作流摘要保留批次和提交记录。取消时也尝试清理；异常中断留下的分支
   必须按 PR 及 SHA 核实后人工清理，不得批量按名字删除。

功能及 CI 修复一律先进 dev。main 不接受独立修复或普通 merge/squash/rebase 晋级，
只快进到已经验收的 dev 提交。首次迁移将旧 main 合并记录纳入 dev，保留已有历史。
workflow bootstrap 须维护者明确操作并通过相同完整门禁，之后仍保持 main 是 dev 的祖先。
nightly 并发串行、不取消正在执行的批次，也不锁住 dev 的日常 PR。
控制器只读写 GitHub 元数据，不在持有写凭据的进程中检出或执行候选代码。

控制器使用 REST API `2026-03-10`，先读取 PR 触发测试合并计算，再读取精确的
`refs/pull/<PR>/merge`，继续验证其双亲与完整文件树。该版本已移除 PR 对象中的
`merge_commit_sha`，不得依赖旧字段。测试引用暂未生成（404）时有界等待；其他 API
错误立即停止，不能用单独的 mergeable 状态替代测试合并树。
参见 [GitHub API 破坏性变更](https://docs.github.com/en/rest/about-the-rest-api/breaking-changes)
和 [Git 引用接口](https://docs.github.com/en/rest/git/refs#get-a-reference)；
原子旧 SHA 校验见 [GraphQL updateRefs](https://docs.github.com/en/graphql/reference/git#updaterefs)。

## 一次性 GitHub App 配置

普通 CI 和只读试跑无需额外凭据。无人值守的 PR 创建/合并使用专用 GitHub App，
不保存个人 OAuth/PAT。GitHub 当前会让默认 `GITHUB_TOKEN` 创建的 PR 工作流等待人工
批准，因此不使用它伪装成全自动方案。

在社区组织创建并仅安装到本仓的 App，仓库权限仅需：

- Contents: read/write（临时分支及合并）
- Pull requests: read/write（批次 PR）
- Workflows: read/write（批次含已审核的 CI 文件更新时，允许 Git 推送该批次）
- Metadata: read（GitHub 自动提供）

关闭 webhook，不授予 Administration、Secrets、Actions write 或保护绕过。
将 App ID 设为仓库 variable `LIANGXIANG_PROMOTION_APP_ID`，私钥通过 GitHub Secrets
设为 `LIANGXIANG_PROMOTION_APP_PRIVATE_KEY`。在 main 的允许写入 App 列表加入此 App；
它仍必须经过 PR 和全部状态检查。令牌由官方固定 SHA 的 action 按本仓和上述显式
权限临时签发，任务结束撤销。Workflows 与 Actions write 是不同权限；不授予触发或
修改工作流运行的 Actions write。`checks: read` 由控制器的内置只读 token 提供。

尚未配置 App 时，定时任务会完整执行只读集成检查，然后明确报出缺失配置，不合并。
手动 `dry_run=true` 无写操作，不会创建 PR 或修改分支，可在授权前验收。App 安装后
先试跑，再人工触发一次 `dry_run=false` 验证首个批次。

## 上游兼容预警

`ci-compat.yml` 的相关 PR、每日北京时间 04:17 及手动检查保持独立。准备任务只解析
一次 DSH alpha，并将四个 DSH 包和 Cordis/group 的精确版本冻结给三平台。
安装政策、白名单与供应链等待期不降低；失败保留为红色，预警不替代锁定依赖门禁，
也不阻止已通过锁定版全量检查的夜间批次。alpha 不表示版本一定高于当前 RC。

## 参考与验收

- [GitHub 定时语法与时区](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
- [默认 token 的触发限制](https://docs.github.com/en/actions/concepts/security/github_token)
- [保护分支](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [作者不能批准自己](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)

最初三平台和上游兼容方向来自 @XChen446 的 PR #7，原贡献记录已保留；后续
批次冻结、权限隔离和协作流程由维护者补强。正式发布仍须项目完整发布门禁。

## 隐私门禁

- 安装 `node scripts/install-privacy-hooks.mjs`，在本地提交内容、提交说明和推送前检查；
  既有 hooks 会串联保留，同仓所有 worktree 共用门禁。Git 身份使用公开账号和 noreply 邮箱。
- 主仓 PR 必须通过 `privacy`，检查最终文件、每个新提交的说明/新增内容、作者与提交者
  邮箱，以及 PR 标题和描述。编辑描述时单独重查，不重复执行三平台验证。
- 社区 PR 使用 `--community-pr`：贡献者自愿公开的提交邮箱仅产生匿名提示，不阻断合入，
  不要求修改 GPG 签名历史。策略中登记的维护者公开姓名/邮箱仍严格匹配；本地提交与推送
  hooks 继续要求当前维护者使用公开账号及 noreply 身份，推送中带入的社区提交邮箱仅提示。
  邮箱提示不等于签名验证或身份认证。
- 拦截私人工作流称呼、本机用户路径、私人会话标识、非匿名邮箱、常见凭据格式和私钥。
  社区提交元数据中的自选公开邮箱除外，文件内容和 PR 文案中的私人邮箱仍会阻断。
  Token、私钥和敏感文件强制检查不变，每个新增提交也检查敏感文件，删除后仍可发现。
  日志只报告类别，不回显命中值、文件名或上下文；规则和测试也不写入私人称呼明文。
- 公开评论或其他文案先保存临时文件，再运行 `check-privacy.mjs --message <file>`。
- 自动扫描不能识别所有自然语言细节或图片内容；维护者仍须审核隐私和门禁本身的修改。
- 已公开历史的修复需独立映射及本地备份。移除当前文字或追加修正提交不会抹去旧提交；
  受保护历史的 force 更新、标签变化和缓存移除必须单独评估，不能冒充已经彻底清除。

CI 与临时 Profile 固定 pnpm 11.28.5，以避开旧 11.7.0 在安装完成后进程不退出的问题（[pnpm #13617](https://github.com/pnpm/pnpm/issues/13617)）。这只约束隔离验收，不修改正在运行的个人开发环境；依赖安装和完整冒烟分别有步骤超时，失败保持主分支不变。

维护者提交使用公开用户名 `NiYa193` 和 GitHub noreply 邮箱，仅在仓库本地配置 Git 身份；
夜间 App 的实际提交与合并使用 `liangxiang-nightly[bot]`。既有 `liangxiang-CI` 公开提交
保持可验证，不为调整显示方式再次改写历史。

个人 GitHub Profile 姓名是账号级资料，不应为项目或 CI 改名；只有用户明确要求
修改这一资料项并指定目标值时，Agent 才可操作。
PR 列表中的用户名与 commit 作者/提交者元数据分别核验。GitHub 网页或 API 合并若会
带入私人姓名、且不能指定公开署名，应在执行前明确提醒用户具体需要进行的操作，
由用户决定处理方式；不得通过修改个人 Profile 解决项目署名问题。
