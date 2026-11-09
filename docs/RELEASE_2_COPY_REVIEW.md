# 梁相2.0.0对外文案审稿

状态：**待用户审核，不授权推送、提PR或发布。** 本次直接准备2.0.0，不单独发行旧版提示补丁。
上一正式版为1.2.0；以下概括两次正式版之间的用户收益，不逐Commit公开开发过程。
最终验证数字与候选SHA由冻结后的发布回执补齐，不能把早期候选测试当最终验收。

## 单提交标题与正文

标题：`feat: add Liangxiang 2.0 wallets, market and blue UI`

```text
Feature:
- Add cumulative incense wallets and three daily long/short pools with midnight settlement.
- Combine candle/tide charts, positions and receipts with the blue pond UI and approved 2.0 update sheet.
- Add soft confirmation sounds for accepted positions, withdrawals and credited settlements.

Bugfix:
- Preserve daily-only accounting until one-way wallet activation and protect activated wallets from legacy mutations.
- Keep vote/order retries, frozen funds, chart interactions and dialog focus consistent.
```

## 社区PR

标题：**梁相2.0：累计钱包、梁股三盘与蓝色水景**

正文草稿：

> 梁相2.0让在线香火与收益跨日保留，并新增早、午、晚三盘做多／做空，午夜统一结算。主面板直达梁股，K线／潮汐、持仓与回执集中展示，主UI与梁祠统一为浅蓝水景，保留原画像、拍打、凝香与倾炉交互。
>
> **Feature**：累计钱包与可用／冻结分离；三盘整炷分池；全天分钟行情及K线／潮汐；蓝色主面板与梁祠；2.0更新页、社群与鸣谢；关键操作的短音反馈。
>
> **Bugfix**：旧身份在启用钱包前继续真实日账，首次启用只承接当天余量；启用后拦截旧协议修改，保护余额与冻结仓位。补齐重复请求、重启及结算一致性和图表／弹层交互回归。
>
> 社区仍是本机声明用量的软信任玩法；旧1.2可继续原日账，同一身份启用2.0后需保持使用支持钱包的版本。

验证：1045项源码检查、34项CI检查通过；完成实包安装、原位升级及桌面／窄屏／暗色交互和音效验证。DSH0.2.2-rc.1安装烟测通过，未调用真实模型。独立测试库双地200并发共16553次请求，非预期错误和账本核对差异均为0。

## GitHub Release

标题：**梁相2.0.0｜香火能攒了，梁股开盘了**

正文草稿：

> **在大A受的伤，让梁股为你抚平。**
>
> 1. **在线钱包**：香火余额与已到账收益跨日保留，可用与冻结一目了然。
> 2. **梁股三盘**：早、午、晚各选多空，封盘前可改可撤，午夜一起揭晓；投入、撤回与到账都有轻声回应。
> 3. **全新水景**：余香化水、游鱼相伴，主面板与梁祠换上浅蓝新装，熟悉的拍打、凝香与倾炉继续陪你玩。
>
> **升级提示**：支持原生更新的DSH优先按梁相详情的版本提示更新；旧入口可卸载梁相插件后重新安装，保留DSH数据目录。2.0启用钱包时保留原身份和当天实际余香与进度，不补发历史已过期香火；启用后同一身份请继续使用2.0及以上版本。暂不升级的1.2用户仍可继续原日账玩法。
>
> 安装与升级：[liang.today/guide](https://liang.today/guide/)。香火只用于插件内游玩，不兑换现金。
>
> 来**QQ群453683905**一起出梁案、晒梁位，和梁友聊聊下一次开盘！
>
> 感谢一直支持梁相的同学们，尤其感谢 @stuffed-cat、@XChen446、@xunxiaoQ、@Ritanlisa，以及每一位社区贡献者与香客。

更新日志已按标准检查：三个用户收益点，不包含后台安全、迁移、测试或Commit施工记录。
客户端定稿更新页的尺寸、Slogan、三条利益点、社群与鸣谢保持原样，不用本稿改写组件。

## npm与市场简介

`package.json.description`及GitHub About候选：

> 梁股开盘了！梁相是DeepSeek Harness插件：对话攒香火，夯拉定梁位；早午晚三盘做多做空，午夜揭晓，在线香火与收益跨日保留。

中文目录简介：

> 在DeepSeek Harness里玩梁股：对话攒香火，早午晚三盘做多做空，K线和潮汐看实时梁位，午夜一起揭晓。在线香火与收益跨日保留；还能一炷夯或拉，众香决定今日梁位，日终收入梁祠。浅蓝水景、游鱼相伴，支持静态模式。

English catalog description:

> Play Lianggu in DeepSeek Harness: earn incense from conversations, choose long or short across three daily pools, follow live candle and tide charts, and settle at midnight. Online incense and settled returns carry across days. Vote up or down to shape Liangzi, enjoy the blue pond UI, and browse the history calendar. An independent community project.

npm首屏以“在大A受的伤，让梁股为你抚平。”开场，先介绍梁股三盘、实时行情、在线钱包与水景，再给出安装步骤。

npm完整正文以[`npm-readme.md`](npm-readme.md)为准，GitHub正文以根[`README.md`](../README.md)为准。
两者共用主UI→梁股→梁祠三张图；npm采用拟发布Tag `v2.0.0` 的GitHub HTTPS地址，Tag创建前仅为候选链接，不表示已公开可访问。正式发布步骤必须先使这些图片地址可用，再验收npm与原生详情渲染。
三图来自最终包的本机隔离示例，统一图注为 **“功能示例，香火数据仅作演示。”**，不作为真实线上资金或收益展示。

升级文字按DSH版本区分：0.2.2-rc.1的[官方插件页说明](https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-plugin-manager/README.zh.md#更新注册表组合包)已提供注册表第三方插件的版本区与更新入口；0.2.1-rc.2旧入口仍采用卸载重装。更新失败后的保留／恢复以应用报告为准，不宣称任何安装来源都支持原生更新或失败必定恢复。

## 审核与发布动作清单

| 状态 | 内容／动作 | 边界 |
| --- | --- | --- |
| 待审 | Commit标题正文、PR标题正文、Release标题正文 | 只在本地准备，不提前推送或提交 |
| 待审 | npm README、包短介绍、GitHub About、市场中英文简介 | 根README与包内README分别验收 |
| 待审 | 主UI→梁股→梁祠三张真实安装截图 | 同一最终包、本机隔离示例；注明“功能示例，香火数据仅作演示”，无私人会话或运维信息 |
| 待最终验收 | 客户端冻结包、新后台主备与回退 | 新后台先接管且主备就绪，再发布客户端 |
| 待批准执行 | 个人fork单提交推送与社区PR／合入 | 保留一个功能分支、一个新Commit，不改写社区已公开历史 |
| 待批准执行 | npm、GitHub Tag／Release、官网／Pages与市场目录更新 | 先审对外文案；npm仍可能需要用户2FA；目录缓存另行复核 |

市场优先级和截图抓取规则见[`PLUGIN_MARKET_DISTRIBUTION.md`](PLUGIN_MARKET_DISTRIBUTION.md)。无媒体能力的搜索卡片只核对图标和简介，不强求三图；支持README或画廊的详情按统一三图展示。
