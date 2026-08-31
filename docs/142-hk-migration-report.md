# 142 — 香港节点迁移实录

> 执行日期：2026-08-18（Asia/Shanghai）  
> 模式：社区 soft-trust / `DEV_STAGING_ONLY`，不是实名或服务器核验 Token。

## 结论

数据库与唯一写入后端已经从原节点迁到香港节点。香港节点先经
`hk-api.liang.today` 旁路验收，再完成 `api.liang.today` 权威解析、公共解析器、
正式证书、签名客户端、快照、梁祠与安全基线终验。原节点后端保持停机，只在
旧端口把请求透明转发到香港，因此 DNS 传播期间没有形成两个可写数据库。

## 数据迁移

迁移使用停写窗口与 SQLite 一致性备份：先停止原后端，再生成最终备份、
核对 SHA-256、传输并恢复到香港，最后才启动香港后端。最终迁移文件摘要：

```text
ddbaf969f18c1288b6bfc49152ba1bb1b6a7f6cbf6d2c36166b17b0d38cd125b
```

恢复后的 `PRAGMA integrity_check` 为 `ok`，核心行数与源端一致：

| 表 | 行数 |
|---|---:|
| `community_identity` | 4 |
| `daily_incense_state` | 8 |
| `daily_liang_case` | 5 |
| `daily_liang_stats` | 5 |
| `liang_vote` | 3,961 |
| `liang_day_archive` | 78 |
| `liang_week_archive` | 11 |
| `liang_month_archive` | 2 |
| `public_liang_snapshot` | 367 |

原节点保留最终停机备份作为限时回滚材料，但不会再启动旧后端。香港节点每次
发布仍由 `scripts/deploy.sh` 在安装前执行 SQLite 在线备份。

## 香港节点安全基线

- Rocky Linux 9.8，SELinux `Enforcing`，已运行最新安装内核；无待重启核心更新。
- 仅允许 `deploy-user` 使用公钥 SSH；root、密码、键盘交互认证、X11、agent、
  TCP/Unix socket 转发与 tunnel 均关闭。
- 云防火墙之外再启用 firewalld：HTTP/HTTPS 对公网开放。应运营者临时外出
  登录需要，SSH 来源暂时对公网开放；认证仍严格限定 `deploy-user + publickey`，
  root、密码认证和转发均保持禁用。
- 200 GiB 数据盘独立挂载到 `/var/lib/liangxiang`，使用
  `nosuid,nodev,noexec`；数据库目录仅运行账户可写。
- 后端只监听 `127.0.0.1:4180`，后端端口与旧明文端口均不对公网开放；Caddy
  独占 80/443，提供自动证书、HSTS、CSP、点击劫持和 MIME 嗅探防护。
- Caddy 与后端都以非特权账户运行；后端 capability 为空，并限制设备、内核、
  namespace、进程视图、系统调用和出站地址。`systemd-analyze security` 评分
  为 1.1（OK）。
- auditd、chronyd、firewalld 均为 active；安全更新由
  `dnf-automatic-install.timer` 每日安装，未启用重复 timer。
- 应用进程的网络沙箱只允许回环，因此应用内自检 NTP 会提示不可达；系统时钟
  由 chronyd 负责，这一取舍保留了后端无公网出站能力。

## 验收结果

- `hk-api.liang.today` 与 `api.liang.today`：Let's Encrypt 证书、HTTP→HTTPS、
  健康检查、安全响应头、快照与历史冷通道通过。
- 未签名 `GET /v1/bootstrap` 返回 401；已登记客户端仍能完成签名 bootstrap；
  清空存储后的独立 Mac mini 则通过公开入梁券完成正式首次登记。
- 本机 MacBook 与独立 Mac mini 均完成 `dsh-liangxiang@0.8.0` 安装验证；
  保留存储的更新路径维持 `storages/liangxiang.json`，全新身份走入梁券/rekey，
  WebUI Host/Client 实际启动通过。
- 代码库、分发目录和香港活动部署扫描不含旧品牌、旧 IP 或旧端口。
- 当前桌面分发包为 `dsh-liangxiang-0.8.0.tgz`，SHA-256 为
  `31a32f2d8a698aeb29c5750598a73e5014b0cf557b383386bc43457a4df0b031`；
  不沿用迁移期旧包摘要。
- 当前正式包为 `dsh-liangxiang@1.0.2`；迁移后的 0.8.1-beta.0
  MacBook 复验属于历史证据，1.0.0 以 npm `latest` 与 GitHub Latest Release 为准。
  不能把不可变的 npm `0.8.0` 与后续修复源码视为同一字节。

## DNS 切换与回收

`api.liang.today` 的权威 DNS、Cloudflare、Google 与现场路由器均已收敛到香港；
正式 Let's Encrypt 证书 CN/SAN 正确，本机与独立客户端通过正式域名读取到同一
105 夯 / 18 拉快照和 78/11/2 梁祠档案。

至少保留原节点转发一个完整 TTL 观察窗；确认没有旧流量后，再单独审批移除
转发、旧节点和迁移期回滚材料。SSH 当前为临时公网来源开放，外出阶段结束后
应恢复固定源或 VPN/Zero Trust 准入。

## 后续准入升级（v0.8.0）

共享社区口令已从生产配置删除。新安装走公开 `/v1/admission/tickets` 自动取券，
再以自身 Ed25519 签名调用 `/v1/admission/claim` 原子认领；成功后不再需要口令。
服务器用 `liang tickets status/list/issue/revoke` 查询库存、发行与作废入梁券。

## 仍需运营侧确认

- 华为云 CBR 策略确实覆盖系统盘与数据盘，并检查首次备份成功，而不是只看
  “已启用”。
- 配置费用/流量、磁盘、CPU、内存、5xx 与证书到期告警。
- 确认每次活动前的入梁券库存与全局认领限流符合预期；旧共享准入通道已从代码删除。
