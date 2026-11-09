# 参与梁相

感谢每一位提出想法、报告问题和贡献代码的朋友。请先 fork
`liang-today/dsh-liangxiang` 到自己的账号，再从社区 `main` 创建功能分支。
fork 必须属于 PR 作者本人的个人账号，改动使用非默认功能分支。
维护者本人也遵守这一流程；社区 `main` 通过 PR 接受通过检查的改动。

## 本地准备

```sh
git clone https://github.com/<your-account>/dsh-liangxiang.git
cd dsh-liangxiang
git remote add upstream https://github.com/liang-today/dsh-liangxiang.git
git remote set-url --push upstream DISABLED
git config remote.pushDefault origin
git config push.default simple
git fetch upstream
git switch -c feat/your-change upstream/main
git push -u origin feat/your-change
```

`origin` 必须是个人 fork；`upstream` 用于同步，禁止直接推送。多个会话并行时使用
各自的 worktree/目录、分支和隔离测试 Profile；不要共享 checkout、切换别人的分支
或使用别人的手测端口。先读 `AGENTS.md` 与 `docs/CURRENT_ARCHITECTURE.md`。

个人推送先完成本地验证；云端 CI 在向社区 main 提 PR 时执行三平台、隐私、完整
安装、浏览器与隔离在线检查。合入后不重复跑同一轮 push 检查。

普通 GitHub 账号的 PR 自动启动 CI，更新提交后自动重跑。新注册账号首次贡献仍可能
需要维护者批准运行，这是 GitHub 的平台限制；CI 运行批准与代码合并审核是两件事。

## 提交 PR

1. 使用仓库指定的 Node、pnpm 和锁文件，完成适合改动的验证。
2. 提交并推送到个人 fork，向社区 **main** 提 PR，说明问题、用户效果和验证结果。
3. CI 通过且与最新 main 无冲突后，由管理员审核、人工合并。自己提交的 PR 不能自己
   Approve；当前单维护者使用人工确认合并，独立审批需要第二位有权限的维护者。
4. 合并后可删除个人功能分支；同步 main 后再开始下一项工作。不要直接在个人 main
   上堆叠所有开发，也不要在社区创建个人功能分支。

修订贡献者的方案时保留来源提交与署名，说明维护者修正，不替换贡献归属。
合入 main 代表源码集成；正式发布时再通知大家更新测试。

社区只使用 main 进行日常集成；dev 已在完整纳入 main 后删除，不再自动晋级。
主仓禁止创建开发分支，禁止直接推送 main；从个人 fork 提 PR，CI 成功后由维护者合并。
公开仓库可以被 clone，但 clone 主仓不授予提交或推送权限；如已这样克隆，请先创建
自己的 fork，将 origin 改为该 fork，并将社区地址设为只读 upstream。
完整检查和权限见 [docs/CI.md](docs/CI.md)。
代码合入不触发 npm、Release/Tag 或部署，正式版本发布需单独确认。

Git 提交和标签默认不签名；GPG／SSH 签名可选，缺少工具、密钥、签名或签名者邮箱信息
不阻断提交、推送或 PR。已有签名与原作者归属保留，不为调整签名政策改写历史。
作者与提交者仍使用本克隆配置的本人账号身份，不借用他人账号、noreply 地址或工具默认身份。
社区贡献者可自愿公开提交邮箱，CI 仅提示。PR 审核、测试、隐私检查与其他分支保护照常执行，
密钥、Token、敏感文件和私人上下文仍是强制门禁；运行时接口鉴权不受此 Git 政策影响。

## 分层红线

```
domain/   纯逻辑（折算、阈值、快照派生、投票词汇）——不 import React / Node / DSH / SQL
shared/   wire 契约与校验（Host↔Client、Host↔Backend）——同上
backend/  权威服务（node:http + node:sqlite）——不相信客户端自报的任何权威字段
host/     DSH 插件宿主半——不自己算全网比例、不自己判定业务日
client/   展示——不持有任何账本
compat/dsh/  唯一允许直接触碰 DSH API 的层，每个适配函数注明验证过的源码路径
```

`../deepseek-harness` 是**只读参考**，不改。用 DSH API 前先读钉住的源码，不要凭记忆猜。

## 提交后立刻 push

每次完成的改动：`git commit` 之后立刻 `git push` 到已跟踪的 remote。不要等用户再吩咐一声。这覆盖了原始 Prompt 4/11 的「禁止 git push」。

用户明确要求仅本地提交时，完成 commit 后停止，不推送、不创建 PR、不发布或部署。

仍然不要自动做：`npm publish`、GitHub Release、公网/production 部署、改用户真实 DSH profile、改 `../deepseek-harness`。

## 提交前

```bash
pnpm run verify      # typecheck + lint + test + build
```

涉及 profile 安装的改动再跑：

```bash
pnpm run smoke:clean-profile
pnpm run smoke:online
node scripts/assert-profile-modules.mjs .dsh-home/profiles/liangxiang-dev
```

## 测试规矩

- 每个 bug 修复都要带一条**会因为该 bug 失败**的回归测试。
- 不变量类的改动要落到 `docs/103-test-matrix.md`。
- 并发/幂等这类性质，测行为而不是实现：从 HTTP 层打真实并发，而不是断言内部调用次数。

## 注释与代码风格

- 注释解释**为什么**（约束、权衡、坑），不解释代码在做什么。不写「这段是我改的」这类给 reviewer 的话。
- 与周围代码保持一致的命名与密度。
- 不为了方便加依赖：本仓运行时依赖是 0 个，这是有意的。

## 不要做的事

- 不把 `anonymous UUID` 说成认证身份，不把 Host 本地可读说成服务端可验证。
- 不为了开发方便悄悄放宽安全模型（例如让客户端自报余额、超时后换新 `request_id`）。
- 不用 DOM 抓 Token、不用 `localStorage` 当票权账本（它只用来记徽章位置）。
- 不在未解除 A3 的情况下引入 `VERIFIED_PRODUCTION`。
