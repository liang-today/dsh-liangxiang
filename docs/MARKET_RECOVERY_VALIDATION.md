# 行情恢复与源码图片验证

核对：2026-11-09。源码候选`2.0.1-alpha.1`，从社区main同步至`c8e75d9`，保留公开快照代理维护。
公开客户端仍为2.0.0；本批只保存个人fork，不提社区PR、不部署或发布。

## 修复范围

- 云端实时连接不可用时，原Host只更新主面板快照，市场缓存没有同步。现在公共点位共用同一快照合并逻辑；请求过市场的Host按不少于5秒且不短于服务端cadence补读当前分钟K线、盘次与香池。
- 健康云流不增加行情请求；重读合并并发，过期身份、案号、业务日和销毁后的响应不能覆盖新状态。失败保留最后确认的数据，但不继续向浏览器标记为实时可用。
- 市场首次读取失败、原生EventSource收到非200后永久CLOSED，均使用可取消的1–30秒退避重新连接。重连只读，不自动提交或重发待确认仓位；旧后台明确不支持市场时停止自动探测。
- 编译后的固定图片URL优先读包内lib，其次源码模块路径，再读clone内的src/client/assets；只有文件缺失才回退，权限等其他错误不掩盖。图片白名单、非法选择器拒绝及缓存失败重试保持。

## 验证结果

| 范围 | 结果与边界 |
| --- | --- |
| 完整源码检查 | 104文件、1071项通过，含类型、lint、构建与原客户端预算 |
| 新增回归 | Host10项、Client8项、真实Backend HTTP→Host SSE→MarketSession3项、实际编译图片HTTP5项；缺陷场景先红后绿 |
| 无操作旁观者 | 另一身份上香后，旁观者current_point、分钟close／volume和实际画图读数更新；钱包不变，无订单请求；健康云流20 ticks不新增市场或快照读取 |
| 实际安装包浏览器 | 全新临时DSH Profile，桌面／窄屏／暗色共21项通过，其中9项覆盖原生浏览器恢复，另12项核对候选更新页、二维码与归焦 |
| 原生EventSource | 未替换构造器；真实HTTP503使探针readyState=CLOSED(2)，随后新连接自动收取其他用户的行情，关闭市场取消已排队重连 |
| 图片与路径 | 四图原字节一致；编译至中文／空格目录，验证完整包无源码、源码兜底、包内优先、非法请求和I/O错误后恢复 |
| 客户端预算 | 724925B raw／409938B gzip9；原725000／430000上限不变，未修改画像、动效或全局压缩选项 |

安装验证使用DSH0.2.1-rc.2、Node22.19.0、pnpm11.28.5，显式本地模式。
所有故障与上香／交易场景只使用内存数据库、回环HTTP或浏览器隔离接口；未读写正式账本、创建正式测试身份、清理现用Profile或替换3999。

Windows用户的具体构建命令暂未取得。已复现“仅编译JS而未复制图片”会404，并修复源码兜底，不能据此宣称已确认该用户根因或已完成Windows原生宿主验收。
正式2.0 npm包包含四张图片；优先以DSH安装精确版本做对照，见[常见问题](TROUBLESHOOTING.md)。

## 复核入口

- `pnpm run verify`
- `tests/host-market-recovery.spec.ts`、`tests/market-client-recovery.spec.ts`
- `tests/host-market-recovery-route.spec.ts`、`tests/host-compiled-art.spec.ts`
- `LIANGXIANG_SKIP_DOTENV=1 LIANGXIANG_SMOKE_BROWSER=1 LIANGXIANG_SMOKE_PORT=3983 bash scripts/smoke-clean-profile.sh tests/browser/market-recovery.spec.ts tests/browser/release-notes.spec.ts`

首日启用前缺少分钟历史与本次断线修复是两件事。本轮不回填、推算或改写正式历史分钟K线，不变更票数、钱包、冻结资金、定梁或结算规则。
