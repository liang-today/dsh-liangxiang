# Cursor Prompt — 完整实现梁祠（日梁 / 周梁 / 月梁）

> 历史材料：该提示词对应的功能已由 Codex 在 v0.4.0 完成，不再作为待执行任务。
> 后续维护以 `AGENTS.md`、`docs/130-liangci-design.md` 和当前测试为准，禁止整段重跑本提示词覆盖现实现。

你现在要在 `dsh-liangxiang` 仓库中完整实现“梁祠”。这不是只做一个日历外壳；必须一次打通领域语义、永久档案、日切封存、历史 API、Host 缓存/增量同步、Client 月历浮层、美术规范、无障碍、测试与文档。

## 一、开始前必须阅读

按优先级完整阅读：

1. `AGENTS.md`
2. `docs/130-liangci-design.md`
3. `docs/020-ui-v0.1.md`
4. `docs/070-backend-architecture.md`
5. `docs/071-database-schema.md`
6. `docs/073-business-date.md`
7. `docs/076-backend-api-v1.md`
8. `docs/102-known-limitations.md`
9. `docs/LIANGXIANG_CURSOR_MASTER_R3.md`
10. `docs/assets/liangci-visual-spec.png`
11. `docs/assets/liangci-icon-system.png`

然后检查当前源码、测试、迁移方式和 pinned DSH 源码。凡是依赖 DSH API 的地方，必须先找到当前本地 DSH 的准确路径、符号和公开/内部属性，不得凭记忆猜 API，不得修改 `../deepseek-harness`。

## 二、不可改变的产品语义

- 梁祠是只读历史，不改变今日梁案、香火、投票资格或账本。
- 投票仍严格只有 `up/down`，UI 仍严格只有 `夯 · 升梁` / `拉 · 降梁`。
- 梁位仍是夯率；梁子仍只由全局夯率驱动。
- 零票仍为 `WAITING / 待开梁`，比例为 `null/null`，不可伪造 50%。
- 梁位、称呼和梁子状态必须来自同一组计数与同一策略版本。
- 梁位继续保留 6 位小数并截断，不得四舍五入跨过状态阈值。
- 业务日只由后端服务器时钟与配置业务时区决定；浏览器日期不能决定今天、日切、周切或月切。
- 本阶段完全不做 GitHub Pages、公开梁祠网站、Pages workflow、额外 CORS 或浏览器直连社区后端。

## 三、梁祠时间语义

### 今日

- 今日格只显示专用 `今日进行中` 图标。
- 今日图标不得显示实时今日梁子头像，不得绑定今日梁相或实时状态。
- 今日不是 `WAITING`，也不是 loading；禁止 spinner。
- 今日不参与本周暂梁或本月暂梁计算。

### 日梁

- 下一业务日开始时，服务器将昨日封存为永久日梁。
- 同一业务日若运营归档/重开过多个梁案，日梁必须汇总该业务日全部已结束梁案的 accepted `up/down` 票。
- 日梁封存后不可被今天的快照或客户端时钟改写。
- 零票日是合法永久档案：`WAITING + --`。
- 功能上线前缺数据是 `无存档`，不可显示成待开梁。
- 未来日期留空。

### 当前周梁

- 周期按后端业务时区的周一至周日。
- 本周只使用周一至昨天的已封存日梁，不包含今日。
- 当前结果标为 `本周暂梁`，不写永久档案。
- 周一没有已结束日期时显示 `本周待积 / --`。
- 下一周开始时，上周结果固定，服务器幂等写入一条永久周梁档案。

### 当前月梁

- 月周期按后端业务时区的自然月。
- 本月只使用 1 日至昨天的已封存日梁，不包含今日。
- 当前结果标为 `本月暂梁`，不写永久档案。
- 每月 1 日没有已结束日期时显示 `本月待积 / --`。
- 下一月开始时，上月结果固定，服务器幂等写入一条永久月梁档案。

### 聚合公式

只能先汇总票数再计算梁位：

```text
period_up_votes   = sum(day.up_votes)
period_down_votes = sum(day.down_votes)
period_total      = period_up_votes + period_down_votes

period_total == 0
  -> ratio = null/null
  -> state = WAITING

period_total > 0
  -> up_ratio = period_up_votes / period_total
  -> down_ratio = period_down_votes / period_total
  -> state = liangziPolicy(up_ratio)
```

这相当于按每日香火数加权。禁止平均 `梁工/梁总/梁神/梁圣/梁祖` 枚举，禁止把每天当成相同权重驱动主周梁/月梁。

## 四、领域与数据库

建立独立、明确命名的历史领域类型，不要塞进 catch-all `liangState`：

```text
LiangDayArchive
LiangWeekArchive
LiangMonthArchive
LiangArchiveBundle / ArchiveVersion
TemporaryWeekLiang
TemporaryMonthLiang
```

数据库迁移必须幂等并升级 `PRAGMA user_version`。至少建立永久日/周/月档案与单调归档版本所需结构：

- 日档案以 `business_date` 唯一。
- 周档案以稳定的 ISO week-year/week 或等价 `week_id` 唯一，并保存 `period_start/period_end`。
- 月档案以 `YYYY-MM` 唯一，并保存 `period_start/period_end`。
- 档案保存原始 `up_votes/down_votes/total_incense`、覆盖日、策略版本和 `finalized_at`。
- 比例/状态原则上不作为第二真相源持久化；由档案计数和策略版本派生。
- 同一日/周/月重复触发封存只能得到同一记录，不能重复插入或重复累计。

日切封存应进入服务器权威事务：

1. 汇总并封存昨日。
2. 若昨日是周日，封存刚结束的完整周。
3. 若昨日是月末，封存刚结束的完整月。
4. 开启今日梁案与今日零票快照。
5. 单调增加 `archive_version`。

正确处理跨月周：周梁按周一至周日；月梁只纳入业务日期属于该月的日梁。

## 五、历史读取与同步

不要把历史数组塞进当前 `LiangxiangWireState`，因为现有 SSE 每个 revision 会发送完整 state，导致历史在每次今日变化时重复发送。

实现独立历史链路：

```text
首次连接：
Backend GET /v1/history
  -> Host 解析、校验和缓存
  -> Browser GET /liangxiang/api/history
  -> 一次获得永久日/周/月档案

日常：
Backend GET /v1/snapshot
  -> 仍只返回今日 active case + 今日 global snapshot
  -> Host SSE 仍只推今日状态

日切：
Host 发现 business_date / archive_version 变化
  -> GET /v1/history?after_version=N
  -> 只补昨日及刚固定的周梁/月梁
```

要求：

- 后端历史响应必须有严格 wire parser/validator，非法、负数、NaN、unsafe integer、日期/区间不一致全部 fail closed。
- 支持单调 `archive_version` 与增量游标；有条件时实现 `ETag / If-None-Match`。
- Host 缓存历史；多个浏览器标签只访问本机 Host，不直接打社区后端。
- 当前周暂梁和当前月暂梁由已取得日梁通过共享纯逻辑派生；当天不随 1 秒 snapshot 刷新。
- 历史请求失败时保留 last-known-good 并标 `档案未更新`，不得影响今日投票。
- dispose/HMR 必须中止历史在途请求、清理监听和缓存订阅；不得新增每标签后台轮询。

## 六、入口与交互

先正式修订 `AGENTS.md` 与 `docs/020-ui-v0.1.md` 的 Region 4 契约，再改 UI：

- 在右侧礼仪控制列中把 `进入梁祠` 放在 `梁相案牍` 下方；案牍内的核香只用于异常修复，不得描述成日常手动同步。
- Hover/Focus 文案：`查看日梁、周梁与月梁`。
- 使用“极简屋檐 + 日历页”的 `currentColor` SVG，不用 emoji、香炉、寺庙剪影。
- `进入梁祠` 是只读历史入口，不是第五区域、第三投票选项或运营控制。

点击后打开居中大型月历浮层：

- 宽度目标 `880px`，允许 `860–900px`。
- 最大高度 `min(760px, 86vh)`。
- 七个等宽日期列 + `124–136px` 周梁列。
- 月梁是标题区右侧横向小牌匾，不进入日历列。
- 日期格约 `84px` 高，格间距 `8px`。
- 底部使用固定详情栏；点击日期只替换详情，不打开第二层 dialog。
- 支持上月/下月、键盘、Escape、focus trap、focus-visible、Hover/Focus tooltip、屏幕阅读器摘要。
- 100%/125%/150% zoom 下不重叠；空间不足时允许日历主体横向滚动，不把格子压到不可读。

## 七、美术实现是硬约束

逐像素参考：

- `docs/assets/liangci-visual-spec.png`
- `docs/assets/liangci-visual-spec.svg`
- `docs/assets/liangci-icon-system.png`
- `docs/assets/liangci-icon-system.svg`

必须复用：

- `src/client/theme.ts` 的 DSH 语义颜色和字体。
- `src/client/artwork/*.png` 的现有六态梁子头像。
- 当前 `currentColor` SVG 图标语言、1px 边框、8/12px 圆角与克制阴影。

美术方向只有一个：`现代编年志 × 克制梁祠`，约 80% DSH 原生、15% 编年日历、5% 梁祠点睛；这也是梁相主面板、入口、欢迎与提示卡的全局视觉母版，见 `docs/140-liangxiang-brand.md`。

时间层级必须有不同轮廓：

- 日梁 = 单页日历。
- 周梁 = 七日册 + 七道刻度。
- 月梁 = 横向月历匾。
- 今日进行中 = 品牌蓝未盖印日历页 + 大号 `今` + `进行中`，无头像。
- 暂梁 = 空心 `暂` 印 + `截至昨日`。
- 永久梁 = 实心小型 `封` 印。
- 无存档 = 中性灰虚线空白页。
- 零票日 = existing waiting 头像 + `待开梁 / --`。

禁止：

- 大面积金红、宫殿、龙纹、牌位、羊皮纸、木纹、卷轴背景。
- 古风手游 UI、通用 Dashboard 卡片、玻璃拟态、霓虹、赛博光效。
- emoji、书法字体、额外字体依赖、另一套新头像。
- 每个状态不同底色形成彩色棋盘。
- 红绿表达夯拉。
- 多层暖色发光、持续漂浮、粒子覆盖日历、日期依次弹入、Hover 大幅缩放。

暖橙和朱红在单屏的合计面积应约 ≤8%，只作为“暂/封”印记与点睛。若实现与视觉母版冲突，不得自由发挥；先报告差异再处理。

## 八、动效

只允许：

- 打开浮层：120–160ms 淡入 + 2px 上移。
- 月份切换：≤150ms 轻微水平过渡。
- 选择日梁：边框和详情内容过渡。
- 今日图标首次出现一次短描边，随后静止。

`prefers-reduced-motion` 下全部直接进入终态。禁止任何持续闪烁或持续动画。

## 九、测试要求

至少覆盖：

### 领域

- 票数加权周梁/月梁。
- 零票日、无存档、未来日期互斥。
- 今日被排除在本周、本月之外。
- 周一 `本周待积`、月初 1 日 `本月待积`。
- ISO 周、跨年周、跨月周、闰年/二月、服务器时区边界。
- 同日多梁案合并。
- 日/周/月封存幂等。
- 个人 Token/香火变化不能影响任何历史梁子。

### 后端与事务

- 日切封存昨日并开今日。
- 周日后封存完整周；月末后封存完整月。
- 重启/重复请求不重复归档。
- 档案和新今日状态不会出现跨事务半完成组合。
- 旧梁案/昨日票继续不能写入今日。

### API / Host

- 首次历史全量一次取得。
- 日常 snapshot/SSE 不携带历史数组。
- 日切仅取增量。
- 非法历史 wire 被拒。
- history 失败保留 last-known-good，今日投票不受影响。
- 多标签不制造多份社区后端历史轮询。
- dispose/HMR 清理干净。

### UI / 美术 / 无障碍

- 今日始终是 `今日进行中`，今日投票不改变其图标。
- 本周/本月暂梁只到昨天，今日投票不改变二者。
- 暂梁、永久、待开梁、无存档均有文字与 aria-label，不能只靠颜色。
- Light/Dark、100/125/150% zoom、键盘、Escape、focus trap、reduced motion。
- 七日列、周梁列和月梁牌匾不重叠。
- 视觉回归或 DOM/CSS 断言证明关键尺寸、容器轮廓、语义色和禁止项没有退化。

## 十、文档与发布纪律

- 更新 `AGENTS.md`、`docs/020-ui-v0.1.md`、数据库/API/业务日/测试矩阵/已知限制等相关文档，使文档与实际实现一致。
- 不得写“已经安全验证”之类超出当前社区软信任模型的文案。
- 不实现 GitHub Pages。
- 不修改用户真实 DSH profile，不修改 `../deepseek-harness`，不做 npm publish、GitHub Release 或生产部署。
- 后端有改动时，按仓库规则用 `scripts/deploy-check.sh` 判断 staging 是否陈旧；除非用户明确授权部署，不要自行部署。
- 跑完整相关 typecheck、lint、unit、integration、UI/backend tests 与 `./scripts/validate.sh`，失败必须修复。
- 完成后按 `AGENTS.md` 强制要求 commit 并 push；永远不要把入梁券 secret 或其他凭据写进源码或分发包。

## 十一、完成标准

只有以下全部成立才能宣布完成：

1. 今日仍按原链路近实时投票，梁祠不会拖慢或污染今日状态。
2. 今日图标只显示 `今日进行中`。
3. 本周、本月只计算截至昨天。
4. 暂梁不入库，周期结束后才幂等封存永久周梁/月梁。
5. 历史首次全量、日切增量、日常不重复发送。
6. 零票、无存档、未来日期语义正确。
7. 同日多案、周/月边界和服务器业务时区正确。
8. UI 与视觉母版一致，没有古风手游化、Dashboard 化或新增头像。
9. 无障碍、主题、缩放、reduced-motion 与生命周期通过验收。
10. 文档、测试、提交和推送全部完成。

请先给出基于当前源码的具体实施计划与需要修改的文件清单，然后连续完成全部实现、验证、文档、commit 和 push；不要只搭 UI 空壳，不要留下伪生产声明，不要中途改做 GitHub Pages。
