# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件包。本页右侧的 `npm i dsh-liangxiang` 不会把插件装进 DSH。

[官网](https://liang.today/) · [安装指南](https://liang.today/guide/) · [源码](https://github.com/liang-today/dsh-liangxiang)

![梁相主界面：上香、显相与香火环](https://liang.today/media/product/liangxiang-main-2k.jpg)

## Desktop（推荐）

打开 **插件 → 添加插件**，输入 **`dsh-liangxiang`**，点击 **安装 → 立即启用**。完整步骤见[安装指南](https://liang.today/guide/#desktop)。

**升级**：在 **插件 → 已安装** 卸载梁相，再按上述步骤安装新版。本机香火与梁祠记录保留。安装后在 **梁相案牍 → 当前版本** 核对版本。

## Cmd

退出对应 WebUI，再安装并启动：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已有全局 `dsh` 时可替换开头；`web` 换成实际 Profile。升级使用插件安装命令；卸载使用 `plugin --profile web remove dsh-liangxiang`。香火账本不随卸载删除。

## 玩法与连接

每天一道梁案，新香客备 10 炷；对话继续攒香。Input + Output Token 按固定倍率折算：Pro ×1，Flash 与其他模型 ×0.5，默认 50,000 Pro 当量一炷。点一下一炷夯或拉，长按 1.5 秒倾炉；众香汇成梁位，日终收入梁祠。梁位低于 25% 显出小难梁；还可在案牍开启定时上香：余额满 500 炷后每 10 分钟按限额上香，23:59 再收尾一次。右键夯或拉设默认方向，DSH 运行时生效；旧版日终开关需重新开启一次。

在线模式无法连接时，请为 DSH 配置 HTTP 代理并重启。设置步骤见[连接说明](https://liang.today/guide/#proxy)。离线模式可直接在本机游玩，香火与社区分别记账。

独立社区项目，非 DeepSeek 官方产品。梁位不代表实名人数、真实民意或任何个人、机构立场。
