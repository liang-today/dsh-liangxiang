# 梁股多客户端内部测试

本环境仅用于未发布候选的人工验证，独立于社区主服、备机原实例、4195时间演练和容量压测库。
只接受已明确核验的standby目标。源码、部署收据、服务身份、监听和数据目录均固定：

| 项目 | 值 |
| --- | --- |
| 服务 | `liangxiang-backend-internal-test` |
| 服务身份 | `liangxiang-internal-test` |
| 源码与收据 | `/opt/liangxiang-internal-test`、其中的 `VERSION` |
| 配置 | `/etc/liangxiang-internal-test.env` |
| 数据库 | `/var/lib/liangxiang-internal-test/data/liangxiang.sqlite` |
| 回环监听 | `127.0.0.1:4196` |
| HTTPS路由 | `/liangxiang-internal-test/`，只放行指定公网出口IP |

采用服务器真实时间和Asia/Shanghai业务日期，不含改时HTTP接口。新测试身份每天获得500炷测试香火；
仍保留普通投票/改仓限额、设备绑定、签名和幂等。测试余额与社区账本不互通。
服务随机器启动并在异常后重启；再次部署先备份自己的数据库，既不清库，也不自动回灌账本。

部署前先与同机维护协调。客户端出口IP和服务器地址只通过进程环境或忽略的本机配置传入，不写入仓库：

```sh
export LIANGXIANG_DEPLOY_MODE=internal-test
export LIANGXIANG_INTERNAL_ALLOWED_IPS='<准确的客户端出口IP，多个用逗号分隔>'
bash scripts/deploy.sh
bash scripts/deploy-check.sh
```

本机部署目标仍须提供完整standby角色、SSH身份/端口、预期主机名及原有HTTPS健康地址。
部署器只更新本环境的代码、服务与数据目录，并在原代理配置中添加独立路由；原后端不重启。
代理更新采用reload，最终监听队列应保持已验证的4096。原服务进程和版本、原始备份指纹核对一致后才完成。

每台测试电脑使用独立DSH测试目录/Profile与同一份候选tarball。启动前必须确认测试健康接口返回对应候选版本，
并带 `X-Liangxiang-Environment: internal-test`。启动进程显式设置：

```sh
export LIANGXIANG_BACKEND_URL='<管理员给出的HTTPS地址>/liangxiang-internal-test'
export LIANGXIANG_SKIP_NPM_FLOAT=1
```

第二项仅用于保留这个测试Profile的候选tarball，避免它被正式 `latest` 替换；不要修改正常使用的Profile。
正式上线不使用此配置。预先准备的测试包应包含确切提交、tarball校验值、已验证DSH版本和启动说明。

各独立设备分别领取测试入梁券；默认维持20个可领取名额。同一台物理机的多个浏览器共享一个Host和钱包，
不同Profile在同一设备上重复申请身份仍可能触发设备绑定，不能把这种预期拒绝判为交易故障。
共同梁位/香池应同步，个人余额与仓位仅属于本人。验收至少覆盖改仓、撤回、重试、断线重连、
封盘/定线、午夜派彩、次日赠香与Token余量，以及服务重启后不重复结算。

验收报告分列功能缺陷与性能容量。响应超时、预期限流/封盘拒绝、回执未确认、独立核账差异使用不同计数；
容量压测结束后撤下临时入口，人工测试服务和其独立数据库继续保留。
