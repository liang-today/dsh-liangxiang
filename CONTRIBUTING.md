# 参与梁相

感谢每一位提出想法、报告问题和贡献代码的朋友。请先 fork
`liang-today/dsh-liangxiang` 到自己的账号，再从社区 `dev` 创建功能分支。
维护者本人也遵守这一流程；社区 `dev` 接受日常改动，`main` 接收验证后的每日批次。

## 本地准备

```sh
git clone https://github.com/<your-account>/dsh-liangxiang.git
cd dsh-liangxiang
git remote add upstream https://github.com/liang-today/dsh-liangxiang.git
git remote set-url --push upstream DISABLED
git config remote.pushDefault origin
git config push.default simple
git fetch upstream
git switch -c feat/your-change upstream/dev
git push -u origin feat/your-change
```

`origin` 必须是个人 fork；`upstream` 用于同步，禁止直接推送。多个会话并行时使用
各自的 worktree/目录、分支和隔离测试 Profile；不要共享 checkout、切换别人的分支
或使用别人的手测端口。先读 `AGENTS.md` 与 `docs/CURRENT_ARCHITECTURE.md`。

个人推送不跑云端 CI，先完成本地验证。云端 CI 在向社区 dev 提 PR 时执行；合入后
不重复跑同一轮，英国午夜的 main 批次再执行完整安装和浏览器等检查。

## 提交 PR

1. 使用仓库指定的 Node、pnpm 和锁文件，完成适合改动的验证。
2. 提交并推送到个人 fork，向社区 **dev** 提 PR，说明问题、用户效果和验证结果。
3. CI 通过且与最新 dev 无冲突后，由管理员审核、人工合并。自己提交的 PR 不能自己
   Approve；当前单维护者使用人工确认合并，独立审批需要第二位有权限的维护者。
4. 合并后可删除个人功能分支；同步 dev 后再开始下一项工作。不要直接在个人 main
   上堆叠所有开发，也不要在社区创建个人功能分支。

修订贡献者的方案时保留来源提交与署名，说明维护者修正，不替换贡献归属。
合入 dev/main 代表源码集成；正式发布时再通知大家更新测试。

每天英国午夜冻结 dev 做完整验收，通过后 main 只快进到该提交，不额外生成合并记录。
因此 dev 始终包含 main：开发时领先，验收后相同。功能和 CI 修复都先提 dev；
不得通过 main 独立开发、squash 或反复反向同步。完整检查和权限见 [docs/CI.md](docs/CI.md)。
代码合入不触发 npm、Release/Tag 或部署，正式版本发布需单独确认。

社区贡献者可自愿公开提交邮箱，CI 仅提示，不要求重写已经签名的提交。维护者继续使用
公开账号及 GitHub noreply 身份；密钥、Token、敏感文件和私人上下文仍是强制门禁。

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
