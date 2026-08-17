# 142 — 香港节点迁移实录

> 执行日期：2026-08-18（Asia/Shanghai）  
> 模式：社区 soft-trust / `DEV_STAGING_ONLY`，不是实名或服务器核验 Token。

## 结论

数据库与唯一写入后端已经从原节点迁到香港节点。香港节点经
`hk-api.liang.today` 完成 HTTPS、签名客户端、快照、梁祠与安全基线验收；
原节点后端保持停机，只在旧端口把请求透明转发到香港，因此 DNS 传播期间
不会形成两个可写数据库。

截至本文记录时，`api.liang.today` 的权威 A 记录仍指向原节点；域名控制台
切换到香港公网 IP 后，还必须完成正式域名证书与多解析器终验，才能把 DNS
切换项标为完成。

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
- 云防火墙之外再启用 firewalld：公网只有 HTTP/HTTPS；SSH 仅接受运维端与
  迁移期原节点的固定源地址。
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

- `hk-api.liang.today`：Let's Encrypt 证书、HTTP→HTTPS、健康检查、快照与历史
  冷通道通过。
- 未签名 `GET /v1/bootstrap` 返回 401；Mac 与树莓派原有 Ed25519 身份均能
  完成签名 bootstrap，数据库身份数没有增长。
- Mac 与树莓派均卸载后重装 `dsh-liangxiang@0.6.0`；安装前后
  `storages/liangxiang.json` 摘要一致，WebUI Host/Client 实际启动通过。
- 代码库、分发目录和香港活动部署扫描不含旧品牌、旧 IP 或旧端口。
- 桌面分发包 `dsh-liangxiang-0.6.0.tgz` 的 SHA-256：

```text
9b92d0bf38a576de2bbdbaa59030624e6721b288436060698b31bafa50af4400
```

## DNS 切换与回收

1. 把 `api.liang.today` 的 A 记录改为香港节点公网 IP；TTL 保持 10 分钟。
2. 不改根域、`www`、`hk-api`，也不添加没有实际监听地址的 AAAA。
3. 等权威 DNS 与公共解析器收敛后，复核 `api.liang.today` 的证书、响应头、
   健康、快照、历史及签名客户端。
4. 至少保留原节点转发一个完整 TTL 观察窗；确认没有旧流量后，再单独审批移除
   转发、原节点 SSH 白名单和迁移期回滚材料。

## 仍需运营侧确认

- 华为云 CBR 策略确实覆盖系统盘与数据盘，并检查首次备份成功，而不是只看
  “已启用”。
- 配置费用/流量、磁盘、CPU、内存、5xx 与证书到期告警。
- 共享社区口令仍是闭测总闸；一次性入梁券替换口令属于后续产品阶段。
