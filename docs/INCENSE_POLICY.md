# 香火倍率与最终用量结算

## 固定两档

每 50,000 Pro 当量生成一炷。输入包含未缓存输入、缓存读和缓存写，输出全量计入；
reasoning 已在输出中，不重复计入。图像只计服务商实际报告的输入用量。

| DSH 记录的模型路由 ID | 香火倍率 | 默认一炷所需原始 Token |
|---|---:|---:|
| DeepSeek Pro 家族 | ×1 | 50,000 |
| DeepSeek Flash 家族 | ×0.5 | 100,000 |
| 缺失、未知、其他模型 | ×0.5 | 100,000 |

版本、显示名、供应商和 API 价格不改变倍率。每日 10 炷赠香、一炷一票和单次补账
异常限幅 5,000 炷保持不变。既往已生成或消费的香火不追溯改写。

唯一规则源为 `src/domain/incense-weight.ts`。按完整路由 ID 匹配模型家族；大小写与
首尾空白归一化，合法末尾容量后缀（如 `[1m]`、`[128k]`）不影响识别。任意标签、
错误括号、嵌入显示文字或带供应商前缀的未知 ID 保守使用 ×0.5。未来符合现有
命名的 Pro / Flash 型号直接沿用各自倍率，无需逐型号升级。

## V4.1 核验

截至 2026-10-19，官方当前发布为 **DeepSeek-V4.1-Flash-1017**，API 名仍为
`deepseek-flash`；旧 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 兼容指向
该 Flash 模型。上述 ID 与 `deepseek-v4.1-flash-1017` 均按 ×0.5 结算。
见 [官方调用说明](https://api-docs.deepseek.com/quick_start/agent_integrations/) 与
[10 月 17 日更新](https://api-docs.deepseek.com/news/news261017/)。

官方另说明 `deepseek-v4-pro` 自 2026-09-14 起临时指向 V4.1-Flash，直到 V4.1-Pro
发布。DSH 记录的是请求路由 ID，不能据此确定服务端实际部署的模型版本。梁相保持
静态规则：记录为 Pro 路由仍是 ×1；记录为 Flash 路由为 ×0.5。**香火倍率不等于
API 计费倍率**，不按供应商临时重定向或日期自动改价。
见 [官方兼容说明](https://api-docs.deepseek.com/news/news260910/)。

## 结算与提示同源

Host 在线、离线均使用同一静态规则，不接受远程倍率覆盖、不查询模型目录，也不
需要额外 DeepSeek Key。下一炷提示由同一 `incenseWeightRows` 生成，阈值读取实际
`tokenPerIncense`，不另维护说明表。`node lib/backend-cli.js rules show` 可只读查看
静态规则，无需打开数据库。

每次请求按最终服务商用量结算，不按会话当前所选模型给历史请求统一定价：

1. 请求头或上下文记录本次路由；成功消息的 `source.model` 优先归属本次请求。
2. 当前 DSH 的 `assistant/message`、`assistant/attempt` 内嵌用量流；最终
   `message.usage` 优先，否则使用流中最后一个 usage 样本。流式中间值不铸香。
3. 失败、重试和取消只结算实际出现用量的尝试一次；未开始的重试不估算用量。
4. 持久化结算游标阻止 replay、重启和在线/离线切换重复计香。会话格式变化时保守
   建立新基线；昨日遗漏请求不转入今日，继承或借用的历史前缀不铸香。

请求途中只显示活动光效与“凝香中”，数字保持已确认值。`agent/assistant-stream`
开始/结束和空闲/销毁通知只驱动独立的本机布尔状态，不读取块正文、不写持久化，
也不发送给 Backend；多会话任一请求仍在进行就保留活动。取消、失败、重试及
卸载按生命周期收束，浏览器断开 Host 时停显；中途装载可在下一真实块接入。
低动态保留静态提示，香火环仅对已确认进度平滑过渡，不按速度预测下一炷。

本机日志只用于读取用量和路由元数据；不保存或上传提示词、回复、源码或会话正文。
Backend 只接收折算后的总量，不接收模型名。赠香与已声明用量独立对账；断线或
日切后，仅在服务器确认业务日后提交积压声明。社区仍为 A3 软信任。

## 兼容与验证

固定 DSH 兼容基线为 0.2.1-rc.2 / `687f282e86`，不修改上游源码。

- `llm/llm-deepseek/src/models.ts`：默认路由 `deepseek-flash` 的显示名为
  DeepSeek-V4.1-Flash；1017 是客户端显示角标，不是新路由。
- `core/agent-loop/src/agent.ts`：消息来源记录本次 `request.model`。
- `tests/domain-incense-weight.spec.ts`：新旧 Flash 别名、未来 Pro、大小写、容量后缀、
  未知 ID、非法后缀、整数精度和同源提示。
- `tests/settled-usage.spec.ts`：使用钉住 DSH 的原生 Session / TokenMeter 验证最终
  用量、四桶输入输出、V4.1 混合路由、重试、迁移、重启、模式切换与重复补记。
- `tests/host-backend.spec.ts`：本机签名 HTTP/SQLite 验证用量声明、赠香、凝香、
  幂等投票与同源规则；不向真实社区登记测试身份或投票。

完整兼容面与发布验证以 `COMPATIBILITY.md`、`CURRENT_ARCHITECTURE.md` 为准。
