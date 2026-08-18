# 143 — 梁案题库与统一运维命令

香港主服务器安装 `/usr/local/bin/liang`。它是日常运维入口，不开放新的公网管理接口；
读取配置、写入 SQLite 或重启服务时仍通过服务器本机权限完成。

## 常用查询

```bash
liang status
liang cases list
liang config list
liang config help
liang logs 200
liang logs -f
```

`liang status` 同时报告 systemd 状态、部署版本、健康检查、业务日期、当前梁案、
原始夯/拉票数、快照序号、档案版本，以及下一道待发布梁案。`cases list` 显示完整排期。

## 梁案排期

服务端每天首次处理新业务日请求时，先封存昨日，再按 `publish_on` 取当日梁案；
指定日期的梁案优先于无日期 FIFO。一个日期最多保留一道未发布梁案，避免积压错位。

```bash
liang cases add --on 2026-08-19 "V4-Pro 写代码是夯还是拉"
liang cases seed --start 2026-08-19 14
liang cases replace --start 2026-08-19
```

内置题库在 `scripts/case-bank.txt`。`seed` 会跳过已经排队的同名题目和已占用日期，
再从下一个空闲业务日连续排期。正式使用应至少保持未来 10 道可见排期。

`replace` 会先完整校验内置题库与日期，再在一个 SQLite 事务中删除全部未发布排期、
按题库顺序连续重建；已发布/已消费的历史行不动。它适合运营者整体换题库，失败时不会
留下只换了一半的队列。

`liang cases publish "标题"` 会立即结掉今日当前梁案并清零新案票数，只用于临时换案，
不是日常排期命令。

## 配置修改

```bash
liang config set snapshot-seconds 2
liang config set vote-rate-limit 300
```

配置修改使用固定白名单并先校验输入；原文件备份到 `/var/backups/liangxiang/`。
命令重启服务并检查本机健康接口，失败会自动恢复原配置。监听地址、数据库路径、
`ALLOW_UNSIGNED` 与 authority mode 不允许从便捷命令修改，避免误开安全边界。

首次登记只使用短期、限量入梁券；服务器没有共享准入口令配置项。
