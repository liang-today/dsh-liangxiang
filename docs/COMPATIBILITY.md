# COMPATIBILITY — 版本基线与 DSH 触点分级

DSH 处于 **Developer Preview**：首个 tagged release 前不承诺兼容。本文件是升级 DSH 时的核对清单。

## 本 RC 实测环境

| 项 | 值 |
|---|---|
| 梁相版本 | 0.8.19-beta |
| DSH npm（类型/CLI devDeps） | `@deepseek-ai/dsh@0.1.0-rc.7` |
| DSH 源码勘察基线 | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（tag `dsh-v0.1.0-rc.7`，与社区 master 一致） |
| Web 界面层 bundle | `@deepseek-ai/dsh-web-app@0.1.0-rc.7` |
| Node | v22.17.0（DSH 要求 `^22.19.0 \|\| >=24`，见下方偏差说明） |
| pnpm | 10.33.0 |
| OS | macOS 26.5.2（darwin 25.5.0） |
| 浏览器 | DSH WebUI 内置 Chromium 形态 |

Node 偏差：实测用的是 22.17.0，低于 DSH 声明的 `^22.19.0`。所有测试与实机验证在此版本通过（`node:sqlite` 自 22.5 起可用）；正式部署请按 DSH 的要求使用 22.19+ 或 24+。

## 触点分级（详表见 [`003`](003-compatibility-matrix.md)）

| 触点 | 分级 | 用途 | 缺失时的降级 |
|---|---|---|---|
| `shell.overlay` 客户端槽位 | 半公开 | 挂载徽章 | 无入口，Host 仍运行 |
| `sessionProjections` + `sessions` | 公开投影 API | 观测 `tokenUsage` | 记账不可用（面板照常渲染并提示） |
| `webServer.register` | 公开 | `/liangxiang/api/*` | 浏览器无通道 → 离线渲染 |
| `storageDomain.open` | 公开 | 主域水位/身份/模式偏好，以及独立离线账本/梁祠 | 内存降级 + 临时身份（大声告警） |
| 浏览器 bundle 包装格式 | **半公开、最易破** | `window.__ModuleLoader__.load` banner | 客户端加载失败 |
| `tokenUsage` 四桶语义 | 公开投影字段 | Effective Token 口径 | 载荷不匹配即跳过并告警 |

所有触点收敛在 `src/compat/dsh/`，每个函数都注明验证过的源码路径。

## 升级 DSH 时必做

1. 重新核对 `docs/003` 的 C6 行（bundle 包装格式，树内 preset 不发布，本仓在 `tsdown.config.ts` 复刻）。
2. 重新核对 `tokenUsage` 四桶是否仍互斥、reasoning 是否仍含在 output（`docs/041`）。
3. 运行 `pnpm run verify`、`pnpm run smoke:clean-profile`、`pnpm run smoke:online`。
4. 重新执行 `node scripts/assert-profile-modules.mjs <profile>`：新版本可能改变 profile 的依赖闭包，一旦 in-box 包被 profile 本地副本遮蔽，工具调用会以 `Cannot read properties of undefined (reading 'prepare')` 的形式炸掉（见 [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)）。
5. 更新本文件的实测环境表与 `docs/000` 的基线。

## 明确不做

- 不修改 `../deepseek-harness`。
- 不依赖 DSH 的内部（非导出）符号；需要时在 `compat/dsh` 里做结构化适配并注明出处。
- 不猜 API：先读钉住的源码再写代码。
