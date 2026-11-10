# 121 — 公网 VPS 部署（社区软信任）

> 这是路径 ③ 的运维说明，不是可信生产。  
> `VERIFIED_PRODUCTION` 仍然启动即拒。不要把本页写成「已验证身份 / 已核验 Token」。

浏览器**不**直连梁相后端。每人本机的 DSH Host 连 `LIANGXIANG_BACKEND_URL`。

每次远端写入前，先在操作汇报中明确**目标字面IP、实时核实的角色、服务名、数据库路径及受保护的正式节点IP**。主备切换后必须重新核实，不能只说“主服／备服”；具体地址只留私有运维回执，不写入Git。完整候选手测要求隔离Backend、Host和Client同版并核对产物来源；旧后台只算兼容性覆盖，不能代替同版验收。更新沿用原测试身份、余额、仓位和待确认意图，先一致备份再比较迁移结果。

```text
香客浏览器  →  本机 DSH WebUI  →  本机 Host 插件
                                      │  首次入梁券 + 后续 Ed25519 签名
                                      ▼
                               公网 VPS（Caddy TLS → 127.0.0.1:4180）
```

## 0. 换服前置门禁：中国大陆可用性

**先验证候选服务器在中国大陆的真实业务可用性，再决定是否切换正式流量。**
适用于更换服务器、公网IP或入口线路，也适用于随版本发布一起迁移后台。
购机、SSH可连、本机健康检查正常、标称带宽高或某一个探针成功，都不能替代此门禁。

1. **先隔离验证。** 正式DNS、生产反代与写入端保持当前服务。候选机使用独立入口和
   独立测试库；可强制目标IP并保留正式Host/SNI验证证书，不关闭TLS校验，不向正式库
   注册测试身份、上香、下单或注入测试时钟。
2. **覆盖大陆多地三网。** 至少覆盖华北、华东、华南、西南的可用测点，并覆盖中国电信、
   中国联通、中国移动；保留城市、运营商、探针来源与时间。用同一批健康探针在相近时间
   对照旧服、新服，包含大陆晚高峰。英国和单台云机结果只作补充，不能代替大陆用户侧覆盖。
3. **测真实协议与业务。** 分别记录DNS、TCP443、严格TLS、HTTPS快照/行情读取、
   已认证SSE持续收取与断线重连。Ping/TCP-ping成功、匿名接口200或预期401不能充当
   已认证业务成功。按当期已确认并发目标在独立库验证容量与梁股基本功能；不得为通过
   测试减少行情频率或信息量。
4. **先约定标准，再出对照结论。** 测试前确定成功率、P95、流中断与恢复时间目标，
   报告样本量、覆盖缺口、错误/超时率、时延分布、流量及CPU/内存/队列，区分探针离线、
   解析旧地址、TCP/TLS故障与业务错误。不能因CPU空闲就断言网络可用，也不能把单点
   ICMP静默直接当真实业务丢包率。
5. **未通过不切。** 先交付可审阅报告与通过/不通过结论。缺少大陆证据、主力运营商或
   区域持续失败、实时业务达不到约定目标时，禁止修改正式DNS、生产反代/上游、唯一
   写入端或分发给客户端的默认后台。只有完成评估且获得本次切换授权才能执行；已有
   明确授权不重复询问。用户明确接受的缺口或风险须单列，不能默认为已通过。
6. **保留回退并复验。** 保留旧服、完整一致备份及单写者交接方案；写入端切换后产生
   新数据，回退也必须从当前写入端重新取得最新一致库，不能启用过期冻结副本。切换后
   再从大陆验证正式域名、真实业务与SSE，单列仍缓存旧地址的测点。权威DNS已更新、
   TTL已过或本机health正常，不等于全国恢复，旧入口退役以实测与回退安排为准。

本门禁不授权购机、付费刷新DNS、关闭认证/TLS或绕过原有发布、隐私和分支保护规则。
与[`RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md)的服务器切换项一并记录验收结果。

## 1. 这套鉴权实际证明什么

| 机制 | 证明 | 不证明 |
|---|---|---|
| 每次安装生成 Ed25519 密钥对 | 后续请求仍是**同一把私钥**的持有者 | DSH 账号、真人、一人一票 |
| 设备指纹 = 本机 MAC 集合的 SHA-256 | 同一台机器重装会撞指纹（提高成本） | 反女巫。MAC 可伪造，无 MAC 的 VM 跳过绑定 |
| 一次性入梁券 | 将首次注册量限制在运营者发行的库存内 | 真人、一人一票；券与指纹都可被有意规避 |
| 单次补账异常限幅默认 250,000,000 Pro 当量（约 5,000 炷） | 限制一次异常声明的增量；这不是每分钟 Token 生成限额 | DSH 真的跑过。持续伪报仍可能注水，这是软信任 |
| 投票额度默认每分钟恢复 500 炷，桶与单次均最多 500 | 约束单安装的上香消费速度，不改变凝香公式 | 真实身份、真实用量；多安装仍是已知软信任边界 |
| 服务端时钟 + 启动时 NTP 告警 | 赠香、业务日与签名时戳用 VPS 时钟 | Host 的 NTP 结果不授权任何东西 |

私钥留在 DSH Host，公钥进 SQLite `community_identity`。  
**不要**用 MAC 派生私钥：MAC 不是秘密，派生等于把身份写在网卡上。

## 2. VPS 最小配方（Ubuntu 22.04+ / Debian 12+）

需要：Node.js ≥ 22、pnpm ≥ 10、Caddy（或 nginx）做 HTTPS。

```bash
# 在仓库根目录
bash scripts/vps-install.sh
```

脚本会：

1. `pnpm install && pnpm run build`
2. 首次登记只走短期、限量入梁券；不存在共享准入口令
3. 安装 systemd 单元 `liangxiang-backend`
4. 打印 Caddy 片段

手动等价：

```bash
sudo useradd --system --home /var/lib/liangxiang --create-home liangxiang
sudo mkdir -p /var/lib/liangxiang/data
sudo cp -a . /opt/liangxiang   # 或 git clone
cd /opt/liangxiang && pnpm install && pnpm run build

# /etc/liangxiang.env  （chmod 640, 属主 root:liangxiang）
LIANGXIANG_AUTHORITY_MODE=DEV_STAGING_ONLY
LIANGXIANG_BACKEND_HOST=127.0.0.1
LIANGXIANG_BACKEND_PORT=4180
LIANGXIANG_BACKEND_DB=/var/lib/liangxiang/data/liangxiang.sqlite
LIANGXIANG_BUSINESS_TZ=Asia/Shanghai
LIANGXIANG_SNAPSHOT_SECONDS=1
LIANGXIANG_TOKEN_PER_INCENSE=50000
LIANGXIANG_ADMISSION_CLAIM_RATE_LIMIT=120
LIANGXIANG_ADMISSION_TICKET_TTL_HOURS=24
LIANGXIANG_ADMISSION_TICKET_MAX_CLAIMS=1
LIANGXIANG_ADMISSION_PUBLIC_LIST_LIMIT=20
# 不要设 LIANGXIANG_ALLOW_UNSIGNED

sudo cp deploy/liangxiang-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now liangxiang-backend
curl -fsS http://127.0.0.1:4180/v1/health
```

健康检查应返回 `authority_mode: DEV_STAGING_ONLY`。若你设了 `VERIFIED_PRODUCTION`，进程会拒绝启动。

## 3. TLS（Caddy）

把 `deploy/Caddyfile` 里的域名换成你的。Caddy 反代到 `127.0.0.1:4180`。  
后端只绑回环；公网只暴露 443。

临时无域名、只做多机联调：

```bash
LIANGXIANG_BACKEND_HOST=0.0.0.0
# 仍不要 ALLOW_UNSIGNED；首次注册走入梁券
# 这是明文 HTTP，只适合短测，测完上 TLS
```

## 4. 香客本机（DSH Host）

每台要投票的机器：

```bash
# 插件装进自己的 DSH profile 后：
export LIANGXIANG_BACKEND_URL=https://api.liang.today
```

首次启动会在本机存储域生成密钥对，自动从社区取一张公开入梁券并签名认领；私钥不出网。
`/v1/health` 与 `/v1/snapshot` 仍可匿名读（落地页 / 运维探活）。投票、claim、bootstrap 必须签名。

## 5. 多服务器联调

1. VPS 按上面跑起来。每个业务日 0 点会把剩余认领补到 1000；也可运行 `liang tickets replenish`。
2. 机器 A、机器 B 各自 DSH 只需使用同一 `LIANGXIANG_BACKEND_URL`；首次安装自动各认领一张券。
3. 两边都应看到同一今日梁案、同一梁位。  
4. 同一台物理机重装插件：设备指纹冲突 → `device_conflict`（409）。换网卡 / 虚拟机 / 伪造 MAC 可以绕过，这是已知上限。

库存与发行统一走服务器命令：

```bash
liang tickets status
liang tickets list 20
liang tickets issue 1000 --claims 1 --ttl-hours 24
liang tickets revoke ticket_<id>
```

### 低打扰客户端广播

紧急或重要短消息可在服务器本机直接写入 SQLite；不开放运营 HTTP 接口。客户端仍通过
已有的约 1 秒公共 snapshot 通道收到消息，再由本机 Host SSE 转给浏览器。广播只在
Region 3 的空闲反馈行暂代「梁小号」：断网、账务异常和上香反馈优先，过期或清除后自动
恢复个人称号；它不会改写「今日梁案」，也不弹 toast 或新增面板区域。

```bash
set -a; source /etc/liangxiang.env; set +a
cd /opt/liangxiang
node lib/backend-cli.js broadcast status
node lib/backend-cli.js broadcast set --level important --hours 168 "QQ群 453683905 已建立，来群里一起出梁案、晒梁位、催更新"
node lib/backend-cli.js broadcast clear
```

客户端把广播放在梁小号原有的 22px 单行槽位：短消息静止显示，长消息在固定 × 右侧
无缝循环；用户点击 × 后仅在本浏览器隐藏当前广播 ID，新广播仍会显示。该操作是本地
外观偏好，不会删除服务器广播，也不影响其他用户。减少动态模式不做连续滚动，完整文案
仍保留在可访问名称与悬浮提示中。

`--level` 只接受 `important` / `emergency`，`--hours` 为 1–720 的整数，文案最多
80 个 Unicode 字符。新消息覆盖旧消息；`status` 可查看已过期但尚未清除的记录。

## 6. 备份与重置

### 明确部署目标

`scripts/deploy.sh` 和 `scripts/deploy-check.sh` 都要求显式目标；不会默认探测公共主域名。
以下值仅放在本机 ignored `.env` 或进程环境中，真实地址和主机标识不要提交仓库：

- `LIANGXIANG_DEPLOY_ROLE`：`standby` 或 `production`。
- `LIANGXIANG_DEPLOY_SSH`：明确的 `user@host`，可另设 `LIANGXIANG_DEPLOY_SSH_PORT`。
- `LIANGXIANG_DEPLOY_EXPECTED_HOSTNAME`：远程 `hostname` 的完整预期值；须含独立的 `standby` 或 `prod`／`production` 名称段，与角色一致。
- `LIANGXIANG_DEPLOY_HEALTH_URL`：该目标的 `https://…/v1/health`，不含凭据、查询参数或跳转。

脚本在复制前核对配置与远程主机名。备服 HTTPS hostname 必须与 SSH hostname 完全相同；
生产使用不同 TLS 域名时，两者解析出的全部地址集合必须一致。配置空缺、角色／主机不符或
健康地址错配会在 rsync 前拒绝，不能靠验证另一台健康服务器通过验收。

备服还会核对 Caddy 的启动、重载均使用 `/etc/caddy/Caddyfile.standby`，部署前后比较其哈希；
只验证现有配置，不安装生产域名模板，不改备服证书或代理文件。生产角色才沿用生产 Caddy 模板更新。
验收比较精确的候选版本、服务构建号与 commit SHA，不采用 SHA 子串匹配。

远程安装与构建由部署账户使用固定的 pnpm 11.28.5 执行；只用该账户的包缓存，不修改服务器全局 pnpm。
部署仍要求干净且已提交的本地工作树。大版本迁移前另保存旧代码与一致 SQLite 的成对回滚点，
记录停止服务、恢复代码／数据库／WAL 状态及重新启动的步骤；当前失败处理不承诺自动恢复旧 schema。
本地提交、备服测试与 GitHub 推送是独立动作，完成备服验收不授权推送或正式发布。

本节手工命令只适用于新建自托管节点或已经明确授权的恢复演练。受管社区节点的日常
更新、迁移、备份、重启和版本戳只能通过仓库 `scripts/deploy.sh` 执行；不得把下面的
片段当成绕过该流程的部署步骤。

正常 staging 发布必须使用 `scripts/deploy.sh`：脚本在重启/迁移前通过
`node:sqlite backup()` 将包含 WAL 状态的一致性备份写入
`/var/backups/liangxiang/`，通过 health 与 history smoke 后才更新 `VERSION`。
不要在服务运行时只复制主 `.sqlite` 文件。

手工停机备份仅用于恢复演练：

```bash
sudo systemctl stop liangxiang-backend
sudo cp /var/lib/liangxiang/data/liangxiang.sqlite /var/backups/liangxiang-$(date +%F).sqlite
# 清空今日账（慎用）：删 sqlite 后重启，会从 待开梁 再开
sudo systemctl start liangxiang-backend
```

## 7. 看日志（不刷屏）

systemd 收 stdout。跟关键交互，不跟 1 秒快照轮询：

```bash
sudo journalctl -u liangxiang-backend -f
```

会出现的行：

- `hello install=lk_… ip=…` — 某个 Host 连上（bootstrap）
- `incense +N炷 … remaining=… tokens=…` — 真的多攒出了香火（普通 Token 申报不打）
- `vote 夯/拉 accepted … 梁位=… 香火=… 香客=…` — 有人投了
- `vote … rejected …` / `deny 401 …` — 票被拒或鉴权失败；同原因一分钟内采样，避免攻击造成日志放大
- `publish archived=… opened=… title=…` — 运营发布了新梁案
- `[liangxiang-ops] broadcast set/cleared…` — 运营设置或清除了客户端广播

不会刷：`/v1/health`、`/v1/snapshot`、`/v1/me/daily-state`、幂等重放和重复拒票。身份只打前 12 字符，不打私钥或入梁券 secret。

## 8. 测试发布新梁案

暂时**不**限制一日一案：发布会归档当前 active 案、开新案、全网票从零开始（待开梁），并清掉当日 `used_incense`（Token 声明保留，香火还能投新案）。旧票留在旧 `case_id` 上，不整库 wipe。

在 **VPS 本机**（直接写 SQLite，不开运营 HTTP 口）：

```bash
set -a; source /etc/liangxiang.env; set +a
cd /opt/liangxiang   # 或仓库目录
node lib/backend-cli.js case publish "测试发布：梁相是夯还是拉"
```

成功响应里会有新的 `active_case.id`（形如 `case-YYYY-MM-DD-<hex>`）和零票 `global_snapshot`。journal 一行 `publish archived=… opened=…`。

香客怎么看到新案（**不是** VPS→Host 的 WebSocket 推送）：

1. Host 已有约 **1 秒**一次的 `GET /v1/snapshot`（公共读，和香火/香客同一条通道）。快照里带 `active_case`；`id` 一变，Host 会 `refreshBootstrap()`，再经本机 SSE 推给浏览器。
2. 鼠标悬停入口 / 打开面板会额外 `POST /liangxiang/api/refresh`，让展开后不必干等到下一秒。

没有单独的「每分钟查梁案」轮询。

仓库脚本必须在持有 sqlite 的那台机器上跑（不再远程 curl）：

```bash
pnpm run publish:case -- "测试发布：梁相是夯还是拉"
```

## 9. 不要做的事

- 未经维护者明确授权，不要再次 `npm publish` 或改变 dist-tag
- 不要声称 verified / 可信全网 / 一人一票
- 不要把 Host 的 NTP 查询结果当成香火授权
- 不要开 `LIANGXIANG_ALLOW_UNSIGNED=1` 上公网
- 不要解禁 `VERIFIED_PRODUCTION`
