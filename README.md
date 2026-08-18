# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

梁相是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 **WebUI 插件**，不是一条可以单独执行的命令。每天一道梁案：用模型烧掉的 Token 凝成香火，投一炷“夯”或“拉”；众人汇成梁位，显出今日梁子。

官网：[liang.today](https://liang.today/) · 源码：[liang-today/dsh-liangxiang](https://github.com/liang-today/dsh-liangxiang) · 安装说明：[部署指南](https://liang.today/guide/)

## 安装

不要运行 `npm i dsh-liangxiang` 或 `npm dsh-liangxiang`。这不是命令行工具，没有可执行入口；npm 会把包名当成子命令，报 `Unknown command: "dsh-liangxiang"`。

先完全退出 WebUI，再写入你的 DSH profile：

```bash
dsh plugin --profile web add dsh-liangxiang@beta
dsh web
```

没有全局 `dsh` 时，把开头的 `dsh` 整段换成 `npx --yes @deepseek-ai/dsh`。页面边缘出现「今日梁相」即表示装好。升级与安装同一条命令；卸载用 `remove`。

## 玩法

- 按 DeepSeek Harness 的 **Input + Output Token** 折算，默认 50,000 Pro 当量凝成一炷
- 一炷一票，只能夯或拉
- **梁位**是社区夯率；梁子按门槛显相：待开梁 / 梁工 / 梁总 / 梁神 / 梁圣 / 梁祖
- 日终结果收入梁祠

> 梁相是独立社区项目，非 DeepSeek 官方产品。梁位是社区软信任玩法，不代表实名人数、真实民意或任何个人、机构立场。

当前请安装 `dsh-liangxiang@beta`。开发、排障与实现说明在源码仓 `docs/`，从 [`docs/INSTALL.md`](docs/INSTALL.md) 开始。
