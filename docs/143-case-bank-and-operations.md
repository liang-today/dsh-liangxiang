# 143 — 梁案题库与统一运维命令

香港主服务器安装 `/usr/local/bin/liang`。它是日常运维入口，不开放新的公网管理接口；
读取配置、写入 SQLite 或重启服务时仍通过服务器本机权限完成。

## 常用查询

```bash
liang status
liang version
liang cases list
liang config list
liang config help
liang logs 200
liang logs -f
```

`liang version` 报告客户端程序号、后台 `server_build`、`/opt/liangxiang/VERSION`
部署标记，以及运行中 `/v1/health`。`liang status` 在此之上再报告 systemd 状态、
业务日期、当前梁案、原始夯/拉票数、快照序号、档案版本，以及下一道待发布梁案。
`cases list` 显示完整排期。

## 梁案排期

服务端每天首次处理新业务日请求时，先封存昨日，再按 `publish_on` 取当日梁案；
指定日期的梁案优先于无日期 FIFO。一个日期最多保留一道未发布梁案，避免积压错位。

```bash
liang cases add --on 2026-08-19 "V4-Pro 写代码是夯还是拉"
liang cases seed --start 2026-08-19 14
liang cases replace --start 2026-08-19
```

内置题库在 `scripts/case-bank.txt`（与 `src/backend/case-bank.ts` 同步）。
`seed` 会跳过已经排队的同名题目和已占用日期，再从下一个空闲业务日连续排期。
正式使用应至少保持未来 10 道可见排期。

队列用尽时，日切不会停、也不会天天复用昨天的题：`ensureActiveCase` 按题库顺序
取下一道并在末尾绕回第一道。自定义题（不在题库里）的下一天从题库第一道重新开始。

`replace` 会先完整校验内置题库与日期，再在一个 SQLite 事务中删除全部未发布排期、
按题库顺序连续重建；已发布/已消费的历史行不动。它适合运营者整体换题库，失败时不会
留下只换了一半的队列。

只改今日题目、保留现有投票时用：

```bash
liang cases retitle "为了多一炷香熬夜攒当量是夯还是拉"
```

这只改 `daily_liang_case.title`，`case_id`、票、快照和香客不动。不要用
`publish` 做这件事：`publish` 会立刻结掉今日当前梁案并清零新案票数，只用于
临时换案，不是日常排期命令。同日被结掉的旧案仍会在日终并入日梁。

正式开梁若只要把**今天**打回待开梁，用：

```bash
liang cases reset --yes
```

这会删除今日票、快照、对应 request receipt 和同日已结旧案，保留题目、身份、已声明
Token 和入梁券。被删 receipt 的 request ID 会被释放；这是显式破坏性重置，不是正常
日切行为。

库存默认只补不换：每个业务日 0 点开当日梁案时检查一次
`ADMISSION_INVENTORY_TARGET`（默认 1000）。不足则按默认 TTL/次数补差额，
白天领完不会立刻补。手工立刻补一次：

```bash
liang tickets replenish
```

需要整批作废再发（例如改 TTL）时才用：

```bash
liang tickets replace --yes --count 1000 --claims 1 --ttl-hours 168
```

会先作废当前全部可用券，再发新的一批。已用尽或已作废的历史券不动。
`liang config set admission-inventory-target 0` 可关闭自动补券。

## 清空历史梁祠

正式发布前若要丢掉测试期日梁/周梁/月档，只清档案、不动今日：

```bash
liang archive clear --yes
```

保留今日梁案、社区身份、入梁券、香火账和未发布排期。会删掉昨日及更早的旧案、票据
及其 request receipt，避免下次日切把旧票重新封进梁祠；相应旧 request ID 也会被
明确释放。已打开的 WebUI 需重启后才会看到空梁祠。没有 `--yes` 不会执行。

## 配置修改

```bash
liang config set snapshot-seconds 2
liang config set vote-rate-limit 300
```

配置修改使用固定白名单并先校验输入；原文件备份到 `/var/backups/liangxiang/`。
命令重启服务并检查本机健康接口，失败会自动恢复原配置。监听地址、数据库路径、
`ALLOW_UNSIGNED` 与 authority mode 不允许从便捷命令修改，避免误开安全边界。

首次登记只使用短期、限量入梁券；服务器没有共享准入口令配置项。
