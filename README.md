# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

梁相是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 WebUI 插件。每天一道梁案：使用 DSH 烧掉的 Token 凝成香火，一炷夯或拉；社区香火汇成梁位，显出今日梁子。日终之后，结果收入梁祠。

独立社区项目，非 DeepSeek 官方产品。

官网：[liang.today](https://liang.today/) · 部署指南：[liang.today/guide](https://liang.today/guide/)

![插件主界面](assets/main-frame.jpg)

![插件主面板](assets/plugin-panel.jpg)

![梁祠](assets/liangci.jpg)

## 安装

先完全退出 WebUI。设置 → **插件市场** → 搜 `liangxiang`。没有插件市场时先装 `dshmarket`，步骤见 [部署指南](https://liang.today/guide/#market)。也已列入 [1024 Store](https://deepseek1024.com/) 和 [awesome-deepseek-harness](https://github.com/Dominic789654/awesome-deepseek-harness)。

也可以直接写入 profile：

```bash
export DSH_HOME="$HOME/.dsh"
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已全局安装 `dsh` 时，把开头的 `npx --yes @deepseek-ai/dsh` 换成 `dsh`。`web` 若不是你的 profile 名，换成实际名字。页面边缘出现「今日梁相」即表示装好。升级重复同一条命令，不要写 `@beta` 或精确号；卸载用 `plugin --profile web remove dsh-liangxiang`。

不要运行 `npm i dsh-liangxiang`：那只会落入当前目录的 `node_modules`，不会进入 DSH。包是给 `dsh plugin add` 用的。

DSH Desktop 必须先把 `DSH_HOME` 指到桌面自己的 harness 目录，再执行同一条 `plugin add`。默认的 `~/.dsh` 桌面客户端不读。详见 [部署指南 · DSH Desktop](https://liang.today/guide/#desktop)。

## 玩法

- 新香客备 10 炷，对话还能继续攒；同一台机器当天重装不会再领一份
- 按 DeepSeek Harness 的 **Input + Output Token** 折算，默认 50,000 Pro 当量凝成一炷
- 一炷一票，只能夯或拉；点一下一炷，长按 1.5 秒倾炉
- **梁位**是社区夯率；梁子按门槛显相：待开梁 / 梁工 / 梁总 / 梁神 / 梁圣 / 梁祖
- 日终结果收入梁祠

> 梁位是社区软信任玩法，不代表实名人数、真实民意或任何个人、机构立场。

公开稳定版是 **v1.1.6**。用户请安装 `dsh-liangxiang`（npm `latest`）；开发、排障与实现说明在 [`docs/INSTALL.md`](docs/INSTALL.md)。
