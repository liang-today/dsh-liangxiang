# 120 — 社区软信任产品方案（Demo → 可推广）

> 决策前提：不等 DSH 可验证身份 / Token。按 [`042`](042-auth-trust-model.md) **路径 ③**：产品明确接受 soft-trust 社区模式。
> 活契约仍是 [`AGENTS.md`](../AGENTS.md)。本文件是 V0.2 的执行方案，不把 `VERIFIED_PRODUCTION` 解禁。

---

## 0. 一句话

**把现在的 RC Demo 做成「装上插件就能一起夯」的社区产品。**  
共享的是同一台梁向后端上的今日梁案；信任模型公开写成软信任，不写成民调、不写成全网公投。

这不是等 DSH。这是选用 042 已经写好的第三条路。

---

## 1. 产品定位（必须先改口，再改代码）

| 现在（V0.1 RC） | 做成产品（V0.2 社区） |
|---|---|
| 本地 / 团队内 staging | 社区风向：所有连上同一后端的 DSH 香客 |
| 文案：本地预发 | 文案：**社区软信任**（香客=安装数，Token=本机声明） |
| 后端默认 `127.0.0.1` | 一台社区后端（先局域网/Pi，再公网反代） |
| 安装：开发者仓库脚本 | 安装：一条插件命令 + 一个后端地址 |
| 禁止 GitHub Release / 公网 | **需要你当场授权**这两项，否则无法推广 |

**永远不说**：verified、secure、可信全网、一人一票、真实人数。  
**可以说**：社区梁位、今日风向、软信任、安装即可参与、可刷可重置所以这是玩法不是民调。

代码里的 `DEV_STAGING_ONLY` 先保留（启动门禁、wire 类型都绑在它上面）。对外文案换成社区；若要改枚举名，单独开一小步，不和推广抢时间。

`VERIFIED_PRODUCTION` 继续启动即拒。

---

## 2. 现状：Demo 已经有什么

闭环是真的，缺的是「别人怎么加入」。

已有：

- 四区面板、夯 · 升梁/ 拉 · 降梁、梁子居中、梁位 6 位小数
- DSH `tokenUsage` → 香火（Host 观测，不可核验）
- 独立后端 + SQLite：CAS 扣香、幂等、并发不超支、1s 快照、投票响应带回梁位
- 插件双半：Host + Client；tarball 可装进 DSH profile
- 限流、业务日、日切

没有（所以还不能叫完整产品）：

1. **别人加不进来** — 后端绑死 localhost，tarball 不含后端，没有社区默认 URL
2. **安装像给开发者看的** — 两条终端、环境变量、profile 陷阱
3. **口吻还是预发** — `STAGING_MODE_NOTE` 不像给香客看的产品说明
4. **没有运营面** — 改今日梁案曾要改环境变量并重启；现已有 VPS 本机 CLI（不开 HTTP 运营口）
5. **没有分发许可** — 站立禁令仍禁止 GitHub Release 与公网部署，除非你明确下令

关键架构事实（推广时要利用，不要搞反）：

```text
浏览器  ──不──直连──>  社区后端
DSH Host（每台香客的本机进程）  ──HTTP──>  社区后端
浏览器  ──/liangbiao/api/*──>  本机 Host
```

所以社区产品 = **插件装到每人的 DSH** + **所有 Host 指向同一 `LIANGBIAO_BACKEND_URL`**。不需要浏览器 CORS，不需要 DSH 云账号。

现成的第一台社区节点：局域网 Pi（`.env.example` 里已有 `bean@192.0.2.21`）。先局域网/Tailscale，再公网。

---

## 3. 目标形态：最小完整产品

一个没读过仓库的 DSH 用户，10 分钟内能：

1. 装上梁向插件
2. 打开 WebUI 看到今日梁向（和别人看到的是同一梁子）
3. 正常用 DSH 攒香火
4. 投出夯/拉，约 1 秒内看到梁位动
5. 读懂这是社区玩法，不是认证公投

运营者能：

1. 一台机器跑后端（systemd 或 Docker）
2. 改今日梁案标题
3. 备份 SQLite
4. 看健康检查与当前梁位

---

## 4. 分三步做（只做社区，不做「可信」）

### C1 — 能发给朋友（约 3–5 天）← 下一步就做这个

没有 C1，推广是空话。

| 项 | 做什么 | 完成标准 |
|---|---|---|
| 社区文案 | `STAGING_MODE_NOTE` 改为香客能懂的社区软信任说明；README 首页按香客写，开发者安装挪到 INSTALL | 面板/SR/README 都不说「预发」，都不说 verified |
| 后端可被远端 Host 连 | 允许 `LIANGBIAO_BACKEND_HOST=0.0.0.0`；文档写清只应放在 Tailscale/反代后面 | 另一台机器的 DSH Host 设 URL 后能 bootstrap + 投票 |
| 社区包 | tarball **带上** `lib/backend.js` 或另打 `dsh-liangbiao-community` 运维包；`docker compose`：后端 + 可选 Caddy | `docker compose up` 后 Host 能连 |
| 安装一条龙 | `docs/INSTALL-COMMUNITY.md`：插件怎么加、`LIANGBIAO_BACKEND_URL` 怎么写、不要把 web-app 装进 profile | 按文档在干净 profile 走通 |
| 软门闩 | 可选 `LIANGBIAO_COMMUNITY_KEY`：Host 请求带共享密钥，错了 401。不是身份，只挡扫到端口的路人 | 无 key 的客户端进不了社区后端 |
| Pi 配方 | 用现有 Pi 当第一节点：systemd、SQLite 路径、备份、`reset:staging` | 你本机 WebUI 连 Pi，第二台电脑也能连 |

**C1 需要你明确点头的两件事（现在的禁令拦住了推广）：**

1. 允许把社区后端绑到非 localhost（局域网 / Tailscale / 反代），这不是「可信生产」，是路径 ③。
2. 允许打 **GitHub Release** 放社区 tarball（仍禁止 npm publish、仍禁止声称 verified）。

没点头就只能继续「你自己仓库里玩」。

### C2 — 像产品而不像仓库（约 1–2 周）

| 项 | 做什么 |
|---|---|
| 默认指向社区 | 社区构建把 `BACKEND_URL` 打进默认值；`LIANGBIAO_OFFLINE=1` 才退回本机演示 |
| 首次打开 | 三句说明：香火怎么来、夯/拉干什么、这是社区软信任 |
| 运营改案 | VPS 本机 `node lib/backend-cli.js case publish "…"`：归档当前案并开新案（见 [`122`](122-identity-recovery.md)、[`121`](121-vps-deploy.md)） |
| 健康页 | `GET /v1/public` 或现有 snapshot：梁位、梁子、香火、香客、业务日——给运营看，也可给落地页用 |
| 备份 | sqlite 日拷 + 恢复步骤 |
| 限流 | 面向社区调参（现在默认 600 次/分/安装，演示向） |

### C3 — 公开推广（有了 C1/C2 再做）

| 项 | 做什么 |
|---|---|
| 公网反代 | VPS + HTTPS，Host 只打 HTTPS |
| 落地页 | 一句话产品 + 安装 + 今日梁向只读（可从健康页拉） |
| Release 节奏 | 跟 DSH rc 钉版本，见 COMPATIBILITY |
| 仍不做 | npm publish、排行榜、一人一票、把香客说成人数 |

DSH 以后若出现签名用量 / 可验证身份：重跑 Gate A，另开可信轨，**不回头改写社区轨的历史账**。

---

## 5. 刻意不做（否则又变回等 DSH）

- 自建账号体系去「假装」DSH 身份（路径 ②，工作量是另一个产品）
- 客户端私钥伪签名
- 把 `installation_id` 说成用户
- 解禁 `VERIFIED_PRODUCTION`
- 排行榜 / 第三票 / 个人梁子成长

女巫问题用**产品诚实**消化，不用假安全消化：玩法允许重置安装，梁位是社区温度计，不是选举。

---

## 6. 建议的立即顺序

C1 身份 / 远端绑定 / 社区口令 / VPS 配方已经落地，见 [`121-vps-deploy.md`](121-vps-deploy.md)。

1. 你申请 Linux VPS，按 121 装后端 + Caddy。
2. 多台 DSH Host 指向同一 `LIANGBIAO_BACKEND_URL` + 同一 `LIANGBIAO_COMMUNITY_KEY` 做联调。
3. 手感过了再 C2（默认 URL、首次说明、运营改案）。GitHub Release 仍等你点头。

公网部署的是**社区软信任**，不是可信全网。`VERIFIED_PRODUCTION` 仍然启动即拒。
