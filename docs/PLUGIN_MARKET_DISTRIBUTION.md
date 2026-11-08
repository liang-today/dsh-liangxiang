# 插件市场：展示来源与发布准备

核对日期：2026-11-08。本文是发布渠道事实索引，不是新的安装教程，也不代表已批准投稿或发布。市场会改变规则，每次正式发布须重新核实；用户安装仍以[安装指南](INSTALL.md)为准。

## 先保证哪些入口

1. **第一优先：DSH原生“发现”的已收录索引，以及 dsh-market / awesome 主链。** 当前原生索引以已能搜到梁相的 DSH Find 为核验对象；dsh-market 与 awesome 共用目录，不按两个独立素材源重复维护。
2. **第二优先：此前已收录的1024 Store。** 保证短介绍、README三图和可安装版本正确。
3. **后续覆盖：开放插件市场、DSHX及其他新目录。** 新增重要入口时补充来源和收录状态；不为次要站点的不同规则重写产品故事。

这是依据安装入口和既有收录确定的工作优先级，不是访问量排名。没有取得各市场流量数据，不能用 Star 推断用户覆盖。DSH原生市场是索引浏览器，**不自带索引源**；第三方目录不能宣传成 DeepSeek 官方推荐，见[官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/docs/user/guide/plugin-market.md)。

## 各入口从哪里取内容

| 入口 | 搜索卡片 | 打开详情后 | 版本、更新与当前状态 |
| --- | --- | --- | --- |
| **DSH原生发现（format-1）** | 第三方索引提供标题、简介、icon；没有三图截图字段。官方参考生成器取最高已列版本包的 locale `meta.title` / `meta.description`，回退包名 / description；icon取包的 `icon` 或 `./icon` export | 优先包的 locale `meta.detail`，再读包内README，最后回退仓库README；不同来源不是同一份文件 | 刷新取决于索引运营方与客户端缓存。参考生成器可同时收录 npm 版本、Git Tag和默认分支，不能把“最高已列版本”一概解释成 npm latest；见[生成器](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/apps/plugin-market-generator/README.md)、[详情解析](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-market/src/detail.ts#L190) |
| **[DSH Find](https://dshfind.com/en)**：原生索引与网站 | [实际索引](https://api.dshfind.com/market/dsh-index.json)已收录梁相；简介与当前GitHub About一致，icon为作者头像。不能据此推断所有字段始终自动跟随About | 网站详情当前没有上游README或产品画廊；原生DSH详情则按上一行的加载规则读取 | 官网称每日刷新，从 GitHub `dsh-plugin` topic发现项目。当前梁相为1.2.0；生成器源码、字段覆盖和强制刷新机制未查到，不能承诺加 `screenshots.json` 就能改变其网站详情 |
| **[dsh-market](https://github.com/dsh-market/dsh-market) / [awesome](https://awesome-dsh-plugin.com/)** | 介绍来自[独立梁相YAML](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/5311c1d45e4a389ce3d93e8a0857f5165b832db7/data/plugins/liang-today__dsh-liangxiang.yml)，不是梁相README；支持目录icon，未设置时回退作者头像 | 截图优先读梁相默认分支根 `screenshots.json`，声明顺序保留；应用内市场缺少声明时可从GitHub README提图。awesome网站另抓默认分支README | [当前目录](https://awesome-dsh-plugin.com/plugins.json)为1.2.0；三图仍是main-frame、plugin-panel、liangci，无梁股。介绍无梁股。npm版本为目录探测到的 `dist-tags.latest`；截图每次市场构建探测，README/npm全量探测为夜间或手动构建，目录文案需更新市场仓 |
| **[1024 Store](https://deepseek1024.com/)** / imsai-sh awesome | [独立curated JSON](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/56c6747445e78a51109b823e2d3a0812f17b3140/catalog/plugins/liang-today--dsh-liangxiang.json)进入D1/KV；作者头像，未找到卡片自定义截图栏 | 运行时从GitHub默认分支读README和manifest；三张图放README，而非另造截图字段 | [当前接口](https://deepseek1024.com/api/v1/plugins/liang-today/dsh-liangxiang)的npm安装记录为1.2.0，GitHub manifest为1.2.2-beta.5；两者应分别检查。修改已有curated条目须维护者审核；外部采集周期未公开 |
| **[开放插件市场](https://dshopen.org/zh/)** | 提供 [format-1索引](https://dshopen.org/index.json)和网站目录；包图标来自发布包 | [维护者选定截图URL](https://github.com/polang233/dsh-plugin-index/blob/6bf12147c363a66afaf0e896dfa390d94e67b1d7/scripts/screenshots.mjs)，最多6张、仅指定GitHub公共图片域名；README猜图为客户端后备 | 本次核对其index与[来源名单](https://github.com/polang233/dsh-plugin-index/blob/6bf12147c363a66afaf0e896dfa390d94e67b1d7/data/sources.json)均未发现梁相。推荐轮换不等于条目刷新；新投稿需另列动作，不能写成“已收录” |
| **[DSHX](https://dshx.io/)** | [搜索接口](https://dshx.io/api/plugins?q=liangxiang)已有梁相；介绍为目录整理，非实时README | [详情接口](https://dshx.io/api/plugins/liang-today-dsh-liangxiang)的icon为空、media为空，README采集日期为2026-10-21；媒体是[独立存储记录](https://github.com/liyown/dshx/blob/468eb00869b52163d24423b22d3e4480fe730d13/apps/framework-hub/src/lib/catalog/operations-v1.media.server.ts) | 条目仍为1.2.1-beta.2、npm安装目标记作unavailable；与其他来源不一致。需重新采集／目录更正及媒体补充，未证实从本仓screenshots自动导入或固定刷新周期 |
| **dsh-plugin.org** | [中文目录API](https://api.dsh-plugin.org/plugins.zh.json)已收录1.2.0；简介未介绍梁股 | 服务端图片和介绍的生成源码未公开核实，不承诺跟随README | 纳入后续复核；先保证上述重要入口，未知规则保持待核实 |

“当前状态”仅表示本次读取，不是正式2.0上线回执。公开1.2仍是现行正式版，未发布2.0候选不能提前作为已发布能力展示。
官方format-1说明取自上游源码 `fcc0ad4621`，不是当前隔离DSH全部行为的实测结论；正式发布按届时支持的DSH版本再次打开索引及详情验收，不为研究改动现有3999环境。

## 三图和介绍的准备方式

| 素材 | 准备规则 | 放在哪里 |
| --- | --- | --- |
| 主UI | 第一张；最新正式候选的256px浅蓝水景、梁子、香火环与梁股入口清楚可见，截图不过度放大 | 版本目录如 `assets/product/2.0.0/main.webp` |
| 梁股 | 第二张；K线／潮汐、盘次、个人可用与投入控件可辨，正常窗口，无开发演示标签 | 同目录 `market.webp` |
| 梁祠 | 第三张；蓝色日历、梁子与日／周／月入口可辨，使用可公开的档案 | 同目录 `liangci.webp` |
| 搜索图标 | 复用现有梁子品牌图，清晰、留白适当；按重要目录实际支持的icon来源设置并验收 | 原生包icon需确实进入tarball；awesome还需目录icon。作者头像型入口不能假定可由包icon覆盖 |
| 短介绍 | 保留品牌短句；简洁点名凝香夯拉、梁股和梁祠，中文／英文含义一致。不包含施工日志或安装命令 | package description／必要locale、GitHub About、两个curated目录分别准备 |

上述三图已在2.0候选实际安装中捕获，使用隔离的功能示例数据，**本地准备完毕、待用户审核，尚未公开部署**。保留“功能示例，香火数据仅作演示”图注；裁掉本机路径、凭据、私人会话、测试身份和内部设施，不把模拟盈亏宣传成真实收益。主UI512×728、梁股1600×1024、梁祠1760×1520，WebP与原始PNG像素一致。静态图优先，轻量GIF仅在实测支持时补充，不把整个宣传视频当首图。市场没有统一可证实的推荐分辨率，按目标容器实看清晰度，避免臆造规范。后续音效候选不改变图像布局，但最终包仍须核对渲染一致性。

为优先兼容重要市场，主README使用标准Markdown三图和仓内相对路径；npm README使用公开、版本固定的GitHub HTTPS图片地址，三图内容和顺序相同。awesome详情会删除原始HTML，并过滤非GitHub图片域名，**只放官网图片可能在该市场消失**。不要把三图做成依赖HTML、脚本或iframe的画廊。

awesome的截图声明可采用如下形态；仅在相应文件已存在并通过审查后加入，不能先提交死链接：

```json
{
  "screenshots": [
    "assets/product/2.0.0/main.webp",
    "assets/product/2.0.0/market.webp",
    "assets/product/2.0.0/liangci.webp"
  ]
}
```

根README与npm README是双源：[`scripts/swap-readme.sh`](../scripts/swap-readme.sh)在prepack时用[`docs/npm-readme.md`](npm-readme.md)替换包内README。只修改GitHub README不会改变新包的详情；2.0候选已声明包icon，复用打包的蓝色梁子画像，未自定义locale详情时使用包README。发布前必须检查最终tarball。第三方目录是否采用该icon仍逐一核验，不能由本仓声明推断已生效。

## 本次发现的待办

| 状态 | 必须准备的内容 | 优先级 |
| --- | --- | --- |
| 已在本地准备，待审 | 主UI／梁股／梁祠三图、根README三图、`screenshots.json`、npm README三图；正式Tag链接公开可用后再发布npm | 第一 |
| 已在本地准备，待审 | package短介绍、包icon及GitHub About候选；在实际DSH Find索引和原生详情验证来源，不能假定其生成器等同官方参考实现 | 第一 |
| 待外部更新批准 | 准备awesome YAML的中英文介绍和icon更新；合并与构建后验收dsh-market和网站 | 第一 |
| 待外部更新批准 | 准备1024 curated介绍更新，复核npm安装目标与GitHub manifest双源版本 | 第二 |
| 待外部更新批准 | 开放市场新收录申请、DSHX过期数据更正；其他市场依重要性补充 | 后续 |

官网、GitHub README、npm包和第三方条目切换到同一获批正式版；素材公开部署、目录PR或投稿均单列批准。前一批仅固化规则，本次2.0发布批次已准备本地素材与文案，但不等于市场已更新；尚未修改公开介绍、上传截图或投稿。

## 每次发布的验收记录

发布前记录目标版本／候选SHA、市场名与优先级、是否已收录、字段来源、材料路径、预览结果、必要外部动作。准备好三图不等于第三方已经刷新；不得为了让网站先显示2.0而提前发布npm。

获批发布后，用完整包名 `dsh-liangxiang` 和中文“梁相”分别复搜，按该入口实际支持项检查搜索卡片、首图、三图顺序、详情、图像加载、安装目标及版本；原生索引还需在实际DSH中打开详情。没有媒体能力的入口保证产品来源链接可达并记录限制，不以不支持三图判作素材缺失。记录检查时间、实际显示版本／图地址、缓存与审核状态。依赖人工目录或外部缓存的项目标为“待审核／待刷新”，与本仓材料缺失区分；重要入口的显示缺陷优先修复，再处理次要目录。

### 抓取与更新机制证据

- awesome [截图声明解析与上限](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/5311c1d45e4a389ce3d93e8a0857f5165b832db7/scripts/probe-screenshots.mjs#L84)：1–8张、相对路径或白名单GitHub地址；[README探测](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/5311c1d45e4a389ce3d93e8a0857f5165b832db7/scripts/probe-readmes.mjs#L126)、[图片域名与HTML处理](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/5311c1d45e4a389ce3d93e8a0857f5165b832db7/scripts/build-site.mjs#L843)。
- awesome [构建流程](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/5311c1d45e4a389ce3d93e8a0857f5165b832db7/.github/workflows/build-site.yml#L187)：截图随构建探测；全量夜间计划02:23 UTC，任务可能延迟。dsh-market [声明截图优先／README回退](https://github.com/dsh-market/dsh-market/blob/3616c431d751aef6146c7de0c8f65b39d8ef9277/src/client/market-data.ts#L1504)。
- 1024 [README／manifest抓取](https://github.com/imsai-sh/dsh-1024store/blob/721ebf6aacc66191a1d3e680c560ad199ce9cbfa/web/worker/lib/github.ts#L119)、[README图片渲染](https://github.com/imsai-sh/dsh-1024store/blob/721ebf6aacc66191a1d3e680c560ad199ce9cbfa/web/src/pages/PackagePage.tsx#L470)、[数据源](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/56c6747445e78a51109b823e2d3a0812f17b3140/docs/plugin-discovery.md)、[既有条目人工审核](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/blob/56c6747445e78a51109b823e2d3a0812f17b3140/CONTRIBUTING.md)。本次接口响应为 `max-age=0, must-revalidate`，不代表后台采集实时，也不能用源码缓存常量承诺线上刷新分钟数。

以上固定SHA仅作为本次来源证据；再发布时应核对市场最新规则是否改变。
