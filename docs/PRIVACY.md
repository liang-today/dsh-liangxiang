# PRIVACY — 梁相处理与不处理什么

范围：本仓 v0.1（DSH 插件 + localhost 后端）。基线 `AGENTS.md` §9。

## 永不采集、永不出网、永不落日志

- prompt、模型回复、reasoning 内容
- 源码、文件内容、会话记录
- 文件路径（诊断用途也只在本机日志出现，且不含内容）
- API key、凭据、provider secret
- 用户名、邮箱、IP 归属地等身份信息（梁相从不索取）

## 实际处理的数据

| 数据 | 存在哪里 | 出网吗 | 说明 |
|---|---|---|---|
| provider-reported token 计数（四桶求和后的两个整数） | Host 内存 + DSH storage domain (`daily_usage`) | 只作为**整数**随 claim 出网 | 不含任何内容，仅数量 |
| 每会话高水位 (`watermarks`) | 同上 | ❌ | 只为防重复计数，`sessionId` 不出网 |
| 假名安装标识 `inst-<uuid>` | DSH storage domain (`identity`) | ✅ 作为请求头 | 梁相自铸的随机 uuid，**不复用** DSH 的 `.anonymous-user-id`；删掉即换新身份 |
| 业务日、`case_id`、`vote_type`、`request_id` | 后端 DB | ✅ | 投票所需的最小意图 |
| 已消费香火数 / 声明的 token 总数 | 后端 DB | — | 服务端持有 |
| 徽章位置 | 浏览器 `localStorage` | ❌ | 纯外观偏好 |
| 离线香火、夯拉、梁案与梁祠 | DSH storage domain (`liangxiang_local.json`) | ❌ | 仅在用户明确选择离线模式后按需创建；永不并入社区 |

## 日志与错误

- 后端投票日志只写 `method / path / status / installation 前 8 字符 / accepted|rejected`。
- 错误响应是结构化的 `{ error: { code, message, field? } }`，**不回显请求体**（有测试断言）。
- Host 侧告警只含原因短语与包名前缀，不含载荷。

## 用户能做什么

- 想换身份：删除 `<DSH_HOME>/storages/liangxiang.json` 的 `identity` 表项（会失去当日已投记录的关联，服务端旧记录仍在）。
- 想完全不出网：首次欢迎页或「梁相案牍」明确选择「离线模式」，也可用 `LIANGXIANG_BACKEND_URL=local` 设首次默认。Host 走 `LOCAL_FAKE_DEV`，全程零出网请求，玩法数据单独保存在 `<DSH_HOME>/storages/liangxiang_local.json`。
- 想删除离线玩法：先切回在线并备份，然后删除 `liangxiang_local.json`；这不会删除社区身份或社区历史票。普通插件更新不删除两个文件中的任何一个。
- 想删除服务端数据：删掉后端的 SQLite 文件（`LIANGXIANG_BACKEND_DB`）。localhost 阶段这就是全部数据。

## 诚实边界

假名安装标识**不是**匿名化保证：同一浏览器/机器的多次投票可被关联，服务端能看到「某个安装今天投了几票、声明了多少 token」。它只保证梁相不知道你是谁，不保证不可关联。
