# 梁位走势（本机观察烛线）

核对：2026-11-06。上位规则见 [`AGENTS.md`](../AGENTS.md)「走势」小节；本文只描述接口、存储与出图契约。

## 一句话

走势画的是**本机看到的**梁位变化，不是社区账本。Host 每秒采一次自己的权威状态，
按 1 分钟成桶（每个业务日最多 1440 根）；没采到样本的时段画成斜线阴影带并写「未统计」，绝不插值、不回填，也不影响投票。

## 数据来源与状态语义

| 状态 | 含义 | 图形 | 读屏 |
|---|---|---|---|
| 有票 | 本机在该桶内观察到样本，且当案已有票 | 蜡烛（夯为朱、拉为青灰） | `梁位 xx.xx% · 夯 N 拉 M` |
| 待开梁 | 有样本但该案零票 | 空档（比值为 `null`，不伪造 50/50） | `梁位 待开梁` |
| 未统计 | 该时段没有样本（Host 未运行、连接不可用或采样间隔过长） | 虚线框，整段最多一个「未统计」标签 | `未统计` |
| 换案 | 同一业务日归档旧案并开新案 | 折线断开，两案不连线 | 按各自案读数 |

缺口判定：相邻样本间隔超过 `max(3 × 采样间隔, 30s)` 即视为掉线。缺口内的票仍计入
全局累计与梁祠档案，走势只是「没看见」。
同一分钟或同一显示周期内换案时，该根烛线只保留最后一案的样本，不混合两案极值；原始分钟记录之外不补历史。跨日掉线只把旧日缺口延伸到其业务日结束，不向旧日文件写入后续日期的空桶。

## 存储

```text
$DSH_HOME/storages/liangxiang-bars/days/<business-date>.json
```

- 一个业务日一个文件，写入方只有 Host 一个；整文件写 `.tmp` + `fsync` + `rename` 原子替换。
- 与 `liangxiang.json` / `liangxiang_local.json` 的 DSH storage domain 不同：这是可重建的派生数据，
  所以按日分文件；坏文件只 warn 后跳过，绝不阻断投票或启动。
- 每 30 秒落一次；重启读回当日文件续写，并把「上次写入→现在」记成一个缺口。
- 环境开关：`LIANGXIANG_BARS=0` 整体关闭；`LIANGXIANG_BARS_DIR` 改目录；
  `LIANGXIANG_BARS_SAMPLE_MS` / `LIANGXIANG_BARS_FLUSH_MS` 改采样与落盘间隔。

## 三个只读接口

契约在 `src/shared/bars-v1.ts`（`BARS_SCHEMA_VERSION = 1`）。三条路由即便 Host 尚未 ready 也可读，
因为它们只回历史；数据缺失返回空数组而不是 5xx。

### `GET /liangxiang/api/bars`

查询参数：`from`、`to`（毫秒时间戳，可省）、`interval`（`1m|5m|15m|1h|1d`，默认 `5m`）。
未知参数、重复参数、`from > to` 均 400。

```json
{
  "schemaVersion": 1,
  "channel": "host-observation",
  "timezone": "Europe/London",
  "interval": "1m",
  "businessDate": "2026-11-06",
  "from": null,
  "to": null,
  "days": [{ "businessDate": "2026-11-06", "intervalMs": 60000, "buckets": [], "gaps": [], "cases": [], "breaks": [] }],
  "meta": { "schemaVersion": 1, "channel": "host-observation", "bucketMs": 60000, "intervals": ["1m", "5m", "15m", "1h", "1d"], "days": [], "newestAt": null }
}
```

`buckets` 内每项：`t`、`open/high/low/close`（0..1，可为 `null`）、`upVotes`、`downVotes`、`samples`、`caseId`、`gap`。
`gaps`：`{ from, to, reason: 'host-down' }`。`breaks`：换案第一笔样本的时间戳。

### `GET /liangxiang/api/bars.svg`

参数：`from`、`to`、`interval`、`theme`（`light|dark`）、`w`（320–1600）、`h`（160–900）。
出图约束：

- 无脚本、无外部引用、无用户文本；所有标签转义；同一输入字节确定。
- 每根蜡烛带 `<title>` 与 `data-candle/data-t/data-close/data-up/data-down/data-samples`。
- 响应头：`content-type: image/svg+xml; charset=utf-8`、`x-content-type-options: nosniff`、
  `content-security-policy: default-src 'none'; style-src 'unsafe-inline'`。
- 缓存：窗口含「现在」（或最后 5 分钟内）时 `cache-control: no-store`；否则 `public, max-age=300`
  并带内容哈希 `etag`。生态可把它当普通图片嵌。

### `GET /liangxiang/api/bars/meta`

`{ schemaVersion, channel, timezone, bucketMs, intervals, days: string[], newestAt }`，供嵌入方先探边界。

`LIANGXIANG_BARS=0` 时三条路由统一 503。

## 客户端

案牍维持四格，下面新增一条通栏 `梁位走势`。从案牍直接打开独立弹窗，仅支持弹窗 / 全屏；关闭状态会记住，不在主面板嵌入走势图。
显示状态与时间范围存 `localStorage` 的 `liangxiang:bars:v1`（`{ slot, range, x, y }`，`range` 为 `15m|1h|today|all`），纯观感偏好，不是任何权威。

浏览器侧交互（服务端 SVG 之外）：滚轮缩放、拖动平移、双击回到最新、键盘 ←/→ 逐烛、`+`/`-` 缩放、`0` 复位、Esc 关闭弹窗；悬停显示该分钟的开/高/低/收。缩放与平移只改请求的 `from`/`to`，因此嵌入方和服务端看到的是同一份几何。
图本身来自 `/bars.svg`，客户端只补烛长切换、键盘逐烛读数与兜底文案；20 秒轮询 `/bars` 取读数。

“今日”与历史日期以 Host 返回的业务时区为准，包含夏令时边界；“全部”读取最近最多 400 个保留的业务日。零票读数为“待开梁”，断线期间不把旧数值重复采成新记录。

弹窗沿用梁相语义色与暖色背景；SVG 背景透明，涨跌使用朱砂与青灰，深浅出图跟随 DSH 实际主题。

## 明确不做

图内不带下单、条件单、策略参数或任何第三方扩展面（2026-11-06 决定废弃）。走势只读、只派生，
不参与扣香、投票、开案、归档或梁位计算。

## 验证

- `tests/domain-bars.spec.ts`：桶、缺口、换案断点、聚合、布局坐标。
- `tests/bars-svg.spec.ts`：无脚本/无外链、字节确定、转义、缺口标签唯一、深浅主题。
- `tests/host-bars.spec.ts`：日文件原子写读、坏文件跳过、重启与跨日缺口、三个路由、ETag/CSP/400/503。
- `tests/client-panel.spec.tsx`：案牍六行结构与走势文案。
- `tests/client-bars.spec.tsx`：零票读数、独立弹窗偏好、业务时区与夏令时。
- `tests/browser/bars.spec.ts`：真实安装后的弹窗、全屏还原、窄屏布局、焦点与主题可访问性。
