# CONTRIBUTING

## 先读这三份

1. [`AGENTS.md`](AGENTS.md) — 产品与工程的**冻结契约**。代码、测试、文档与它冲突时，以它为准；要改产品语义，先改它。
2. [`docs/075-backend-decision.md`](docs/075-backend-decision.md) — 信任模型的结论。任何涉及「可信/verified」表述的改动都要对齐它。
3. [`docs/102-known-limitations.md`](docs/102-known-limitations.md) — 已接受的限制。别为已记录的限制提交「修复」，除非真的把它解除了。

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
