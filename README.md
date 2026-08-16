# dsh-liangbiao(梁标)

梁标是一个 DeepSeek Harness(DSH)WebUI 插件:把符合口径的 token 用量折算为梁气、铸造梁签,对唯一活跃梁案投「夯/拉」。悬停文案恒为 `今日梁位`。

当前状态:**最小可安装骨架**。Host 半只有生命周期标记,Client 半只在 WebUI 右缘渲染一个占位圆点,证明双半注册成功。梁气、梁签、token 记账与网络均未实现。

设计文档见 [`docs/`](docs/):`000` 版本基线、`001` DSH 勘察问答、`002` 架构、`003` 兼容性矩阵(含本骨架实际使用的接口)。

## 结构

```
├── package.json          # dsh.bundle + dsh.client 双清单
├── cordis.patch.yml      # bundle 层:插入 Host 插件行
├── tsdown.config.ts      # Host ESM + Client 浏览器 CJS factory(复刻树内包装格式)
└── src/
    ├── index.ts          # Host entry(package main)
    ├── host/             # Host 插件本体
    ├── client/           # Client entry + 占位徽章
    ├── shared/           # host↔client 共享契约
    ├── domain/           # 纯逻辑层(后续里程碑)
    └── compat/dsh/       # 唯一允许直接 import DSH API 的层
```

## 开发(Development)

前置:Node ≥ 22(DSH 官方要求 ^22.19.0 || >=24)、pnpm ≥ 10、可访问 npm registry。骨架本身**不需要任何 API key**。

所有 `dsh` 调用通过 devDependency `@deepseek-ai/dsh` 进行(`pnpm exec dsh`),并默认使用项目本地 `DSH_HOME=<repo>/.dsh-home`(gitignored),不触碰你的 `~/.dsh`。可在 `.env` 覆盖(见 `.env.example`)。

### 命令一览

| 目的 | 命令 |
|---|---|
| 安装依赖 | `pnpm install` |
| 严格 typecheck | `pnpm run typecheck` |
| Lint | `pnpm run lint` |
| 单元测试 | `pnpm run test` |
| 构建 Host + Client 产物 | `pnpm run build`(产出 `lib/index.js`、`lib/client.js`) |
| 一键验证 | `pnpm run verify` |
| 安装进 `liangbiao-dev` profile | `pnpm run dev:install` |
| 查看 effective config | `pnpm run dev:dump-config` |
| 启动 WebUI(带插件) | `pnpm run dev:web`(默认 `http://127.0.0.1:3080`) |
| 卸载插件 | `pnpm run dev:uninstall` |
| 打本地 tarball | `pnpm run pack:tarball` |
| 干净 profile 冒烟测试 | `pnpm run smoke:clean-profile` |

### 开发循环

1. `pnpm install` — 安装工具链与 DSH 类型包/CLI(`prepare` 会顺带构建一次)。
2. `pnpm run dev:install` — 构建后创建 `liangbiao-dev` profile:先装 `@deepseek-ai/dsh-web-app`(Web 界面层),再以 **pnpm link 方式**装入本地检出;随后自动用 `--dump-config` 断言 `dsh-liangbiao` bundle 层存在。
3. `pnpm run dev:web` — 启动 WebUI。右缘应出现占位圆点,悬停显示 `今日梁位`;终端出现 `[dsh-liangbiao] host half active`。
4. 改 Client 代码后 `pnpm run build`(或 `pnpm exec tsdown --watch`):web-app 组合默认挂载的 HMR 会 stat-poll 到 `lib/client.js` 变化并热替换,无需重启;改 Host 代码需重启 `dev:web`。
5. `pnpm run dev:uninstall` — 移除依赖与 bundle 层,并断言 dump-config 中不再出现;重启后徽章与 Host effect 一并消失(注册寿命随插件 fiber)。

### 发行验证

`pnpm run smoke:clean-profile` 会:打 tarball → 在全新 profile 安装 web-app + tarball → 断言 dump-config 有 bundle 层 → 启动 WebUI → 断言 `/plugins/dsh-liangbiao/client.js` 以 `window.__ModuleLoader__.load` banner 开头、`__DSH_BOOT__` 启动图包含本插件、Host 生命周期日志出现 → 清理。

### 版本基线注意

DSH 处于预发布(首个 tagged release 前无兼容承诺)。本骨架的类型/CLI devDeps 钉在 npm `0.1.0-rc.6`,源码勘察基线是本地检出 `47f94385`(`0.1.0-rc.5`,rc.6 的直接前驱);升级任一侧前先按 `docs/000` 的重勘察清单核对,重点是 `docs/003` C6 行(浏览器 bundle 包装格式,树内 preset 不发布,本包在 `tsdown.config.ts` 复刻)。
