# INSTALL — 安装与运行

前置：Node ≥ 22（实测 22.17；DSH 官方要求 `^22.19.0 || >=24`）、pnpm ≥ 10。插件本身**不需要任何 API key**（只有在 WebUI 里真正和模型对话才需要）。

## 一、从仓库开发运行（推荐）

```bash
pnpm install
pnpm run dev:install     # 构建 + 装入 liangxiang-dev profile（含模块图断言）
pnpm run dev:web         # 启动 WebUI，默认 http://127.0.0.1:3080
```

右缘会出现一个圆形入口，图标就是当前梁子状态，悬停显示 `今日梁相`；可以拖到任意位置。

默认是在线（烘焙社区后端）。欢迎页可改用本地。强制本地假账并走 CLI 入账：

```bash
LIANGXIANG_BACKEND_URL=local pnpm run dev:web   # 终端 A：强制本地假账
pnpm run dev:credit                            # 终端 B：+1 炷
pnpm run dev:credit -- 9                       # +9 炷
```

想跑自建在线链路：

```bash
# 终端 A
LIANGXIANG_BACKEND_DB=.liangxiang-backend/dev.sqlite pnpm run backend:start   # http://127.0.0.1:4180
# 终端 B
LIANGXIANG_BACKEND_URL=http://127.0.0.1:4180 pnpm run dev:web
```

此时 authority mode 变为 `DEV_STAGING_ONLY`（服务端记账的社区软信任，见 [`075`](075-backend-decision.md)）。公网 VPS 配方见 [`121-vps-deploy.md`](121-vps-deploy.md)。

一键自检：`pnpm run smoke:online`（会断言拒绝 `VERIFIED_PRODUCTION`、claim 折算、幂等只扣一次、50 并发只接受 1 票、快照发布）。

## 二、从 RC tarball 安装到自己的 profile

```bash
pnpm pack                                            # 当前产出 dsh-liangxiang-0.8.0.tgz
dsh plugin --profile <你的 profile> add ./dsh-liangxiang-0.8.0.tgz
```

两点注意：

1. **不要**把 in-box bundle（如 `@deepseek-ai/dsh-web-app`）装成 profile 依赖。它只需要出现在 `dsh.profile.bundles` 里；装进 `<profile>/node_modules` 会遮蔽 launcher 的模块回退目录，造成同一个包出现两个实例，工具调用会直接报 `Cannot read properties of undefined (reading 'prepare')`。装完可以跑 `node scripts/assert-profile-modules.mjs <DSH_HOME>/profiles/<profile>` 自检。
2. **tarball 不含后端**（`lib/backend.js` 不在包内，插件包只有 Host + Client 两半）。要在线模式就从仓库跑 `pnpm run backend:start`。

## 三、环境变量

全部可选，见 [`.env.example`](../.env.example)。最常用：

| 变量 | 作用 |
|---|---|
| `LIANGXIANG_BACKEND_URL` | 默认烘焙社区地址（在线）。`local` 强制本地演示 |
| `LIANGXIANG_COMMUNITY_KEY` | 仅旧客户端兼容；0.8+ 新安装会自动从社区领取并认领入梁券 |
| `LIANGXIANG_TOKEN_PER_INCENSE` | 每炷香的 Token 数（默认 50,000；调小便于演示） |
| `LIANGXIANG_SNAPSHOT_SECONDS` | 快照/轮询节奏（默认 1s） |
| `LIANGXIANG_BUSINESS_TZ` | 业务时区（默认 `Asia/Shanghai`）；在线模式下**后端**的这项才是权威 |
| `LIANGXIANG_BACKEND_DB` | 后端 SQLite 路径（默认 `.liangxiang-backend/liangxiang.sqlite`，`:memory:` 可用） |
| `DSH_HOME` | 脚本默认用项目内 `.dsh-home`，不碰你真实的 `~/.dsh` |

## 四、卸载

```bash
pnpm run dev:uninstall   # 移除依赖与 bundle 层，并断言 dump-config 里不再出现
```

重启后徽章与 Host effect 一并消失（注册寿命随插件 fiber）。后端数据就是那个 SQLite 文件，删掉即清空。
