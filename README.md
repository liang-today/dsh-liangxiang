# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

梁相是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **WebUI 插件**，不是普通 npm 依赖。本页右侧自动生成的 `npm i dsh-liangxiang` **不会**把它装进 DSH。

## 安装

先完全退出 WebUI，再写入你的 DSH profile：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang@0.8.5-beta
npx --yes @deepseek-ai/dsh web
```

已全局安装 `dsh` 时，把开头的 `npx --yes @deepseek-ai/dsh` 换成 `dsh`。`web` 若不是你的 profile 名，换成实际名字。页面边缘出现「今日梁相」即表示装好。

升级前先退出 WebUI，先 `remove` 再 `add dsh-liangxiang@0.8.5-beta`。只重复 `add @beta` 不会升号：profile 钉着旧精确版本，而且 pnpm 11 会跳过刚发布的标签。卸载：`plugin --profile web remove dsh-liangxiang`。两条命令都加上 `export DSH_HOME="$HOME/.dsh"`。

官网：[liang.today](https://liang.today/) · 部署指南：[liang.today/guide](https://liang.today/guide/) · 源码：[liang-today/dsh-liangxiang](https://github.com/liang-today/dsh-liangxiang)

## 玩法

- 按 DeepSeek Harness 的 **Input + Output Token** 折算，默认 50,000 Pro 当量凝成一炷
- 一炷一票，只能夯或拉
- **梁位**是社区夯率；梁子按门槛显相：待开梁 / 梁工 / 梁总 / 梁神 / 梁圣 / 梁祖
- 日终结果收入梁祠

> 梁相是独立社区项目，非 DeepSeek 官方产品。梁位是社区软信任玩法，不代表实名人数、真实民意或任何个人、机构立场。

当前请安装 `dsh-liangxiang@beta`。开发、排障与实现说明在源码仓 `docs/`，从 [`docs/INSTALL.md`](docs/INSTALL.md) 开始。
