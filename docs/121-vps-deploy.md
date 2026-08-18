# 121 — 公网 VPS 部署（社区软信任）

> 这是路径 ③ 的运维说明，不是可信生产。  
> `VERIFIED_PRODUCTION` 仍然启动即拒。不要把本页写成「已验证身份 / 已核验 Token」。

浏览器**不**直连梁相后端。每人本机的 DSH Host 连 `LIANGXIANG_BACKEND_URL`。

```text
香客浏览器  →  本机 DSH WebUI  →  本机 Host 插件
                                      │  首次入梁券 + 后续 Ed25519 签名
                                      ▼
                               公网 VPS（Caddy TLS → 127.0.0.1:4180）
```

## 1. 这套鉴权实际证明什么

| 机制 | 证明 | 不证明 |
|---|---|---|
| 每次安装生成 Ed25519 密钥对 | 后续请求仍是**同一把私钥**的持有者 | DSH 账号、真人、一人一票 |
| 设备指纹 = 本机 MAC 集合的 SHA-256 | 同一台机器重装会撞指纹（提高成本） | 反女巫。MAC 可伪造，无 MAC 的 VM 跳过绑定 |
| 一次性入梁券 | 将首次注册量限制在运营者发行的库存内 | 真人、一人一票；券与指纹都可被有意规避 |
| `LIANGXIANG_COMMUNITY_KEY` | 旧客户端滚动兼容总闸 | 身份；0.8+ 正式客户端不需要它 |
| 每分钟最多 50,000 声明 Token（= 1 炷） | 瞬间自报 `1e12` Token 攒不出香火 | DSH 真的跑过。慢速撒谎 Host 仍能按上限注水 |
| 服务端时钟 + 启动时 NTP 告警 | 香火 drip / 签名时戳用 VPS 时钟 | Host 的 NTP 结果不授权任何东西 |

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
2. 保留/生成旧客户端兼容 `LIANGXIANG_COMMUNITY_KEY`（新客户端不分发）
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
LIANGXIANG_COMMUNITY_KEY=<openssl rand -hex 32>
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

1. VPS 按上面跑起来，先运行 `liang tickets issue 1000` 准备库存。
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

## 6. 备份与重置

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

不会刷：`/v1/health`、`/v1/snapshot`、`/v1/me/daily-state`、幂等重放和重复拒票。身份只打前 12 字符，不打私钥/社区口令。

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

- 不要 `npm publish`
- 不要声称 verified / 可信全网 / 一人一票
- 不要把 Host 的 NTP 查询结果当成香火授权
- 不要开 `LIANGXIANG_ALLOW_UNSIGNED=1` 上公网
- 不要解禁 `VERIFIED_PRODUCTION`
