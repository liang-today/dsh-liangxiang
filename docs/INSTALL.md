# INSTALL — 安装与运行

前置：Node ≥ 22（实测 22.17；DSH 官方要求 `^22.19.0 || >=24`）、pnpm ≥ 10。插件本身**不需要任何 API key**（只有在 WebUI 里真正和模型对话才需要）。

## 一、从仓库开发运行（推荐）

```bash
pnpm install
pnpm run dev:install     # 构建 + 装入 liangbiao-dev profile（含模块图断言）
pnpm run dev:web         # 启动 WebUI，默认 http://127.0.0.1:3080
```

右缘会出现一个圆形入口，图标就是当前梁子状态，悬停显示 `今日梁位`；可以拖到任意位置。

默认是 `LOCAL_FAKE_DEV`（进程内记账，零出网）。面板投票区下方有 **演示 +1 炷**：只改这一页的画面，不打模型、也不请求 Host/后端。点 **上达天听** 会清掉。连点九次可看九根香柱。

本地假账才走 CLI 入账（会写入本机账本，可投票）：

```bash
unset LIANGBIAO_BACKEND_URL   # 必须是本地假账
pnpm run dev:web              # 终端 A
pnpm run dev:credit           # 终端 B：+1 炷
pnpm run dev:credit -- 9      # +9 炷
```

想跑在线链路：

```bash
# 终端 A
LIANGBIAO_BACKEND_DB=.liangbiao-backend/dev.sqlite pnpm run backend:start   # http://127.0.0.1:4180
# 终端 B
LIANGBIAO_BACKEND_URL=http://127.0.0.1:4180 pnpm run dev:web
```

此时 authority mode 变为 `DEV_STAGING_ONLY`（服务端记账的社区软信任，见 [`075`](075-backend-decision.md)）。公网 VPS 配方见 [`121-vps-deploy.md`](121-vps-deploy.md)。

一键自检：`pnpm run smoke:online`（会断言拒绝 `VERIFIED_PRODUCTION`、claim 折算、幂等只扣一次、50 并发只接受 1 票、快照发布）。

## 二、从 RC tarball 安装到自己的 profile

```bash
pnpm pack                                            # 产出 dsh-liangbiao-0.1.0.tgz
dsh plugin --profile <你的 profile> add ./dsh-liangbiao-0.1.0.tgz
```

两点注意：

1. **不要**把 in-box bundle（如 `@deepseek-ai/dsh-web-app`）装成 profile 依赖。它只需要出现在 `dsh.profile.bundles` 里；装进 `<profile>/node_modules` 会遮蔽 launcher 的模块回退目录，造成同一个包出现两个实例，工具调用会直接报 `Cannot read properties of undefined (reading 'prepare')`。装完可以跑 `node scripts/assert-profile-modules.mjs <DSH_HOME>/profiles/<profile>` 自检。
2. **tarball 不含后端**（`lib/backend.js` 不在包内，插件包只有 Host + Client 两半）。要在线模式就从仓库跑 `pnpm run backend:start`。

## 三、环境变量

全部可选，见 [`.env.example`](../.env.example)。最常用：

| 变量 | 作用 |
|---|---|
| `LIANGBIAO_BACKEND_URL` | 设了就走在线模式（`DEV_STAGING_ONLY`），不设就是本地演示 |
| `LIANGBIAO_COMMUNITY_KEY` | 与后端相同的社区口令；后端设了则 Host 必带 |
| `LIANGBIAO_TOKEN_PER_INCENSE` | 每炷香的 Token 数（默认 50,000；调小便于演示） |
| `LIANGBIAO_SNAPSHOT_SECONDS` | 快照/轮询节奏（默认 1s） |
| `LIANGBIAO_BUSINESS_TZ` | 业务时区（默认 `Asia/Shanghai`）；在线模式下**后端**的这项才是权威 |
| `LIANGBIAO_BACKEND_DB` | 后端 SQLite 路径（默认 `.liangbiao-backend/liangbiao.sqlite`，`:memory:` 可用） |
| `DSH_HOME` | 脚本默认用项目内 `.dsh-home`，不碰你真实的 `~/.dsh` |

## 四、卸载

```bash
pnpm run dev:uninstall   # 移除依赖与 bundle 层，并断言 dump-config 里不再出现
```

重启后徽章与 Host effect 一并消失（注册寿命随插件 fiber）。后端数据就是那个 SQLite 文件，删掉即清空。
