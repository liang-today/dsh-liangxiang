# Changelog

## 0.1.0 — 未发布

### DSH Authority Spike + 真实 Token + 本地完整闭环（Prompt 2）

- Authority Spike（docs/040–044）：DSH 无 authenticated user、无服务器可验证 Token 权威;anonymous-user-id 仅假名标识。**Decision Gate A = A3**，生产可信投票标记 BLOCKED（P0 open risk），本地闭环以 `LOCAL_FAKE_DEV` 模式诚实标注。
- 真实 Token 接入：`tokenUsage` 投影观测（启动补扫 + 变更流），每会话高水位差分账本（replay/restart/重放/替换回落均不双计;新会话 `firstLiveSeq===0` 全额计入，resume/fork 基线化），按可配置 business timezone 入账当日，storage domain `liangbiao` v1 持久化（缺席时内存降级）。
- 本地投票闭环：`FakeAuthoritativeLiangService`（同步事务防并发双花、requestId 幂等、首票香客、快照 cadence 发布——比例与梁子状态同 sequence）、`/liangbiao/api` HTTP+SSE 通道（边界校验、body 上限、心跳、卸载清理）、client live store（帧校验、旧帧拒收、同 id 有界重试、离线保留最近状态）。
- 新增 45 项测试（水位账本、服务事务矩阵、wire 边界、live store），总计 170 项全绿。

### R2 语义对齐 + 正确 UI + 领域模型（Prompt 1）

- 业务语义纠偏至 R2 冻结模型：全网夯率驱动中央梁子（待开梁 + 梁工/梁总/梁神/梁圣/梁祖），个人梁气 = 剩余香火 + 下一炷 Token 进度;废弃 梁签/cacheRead×0.1/目标模型口径/per-request cap（见 `docs/SEMANTIC_CORRECTION_R2.md`）。
- 纯领域层 `src/domain`：Token→香火折算（50K=1 炷，可配置）、梁子五态阈值策略（60/70/80/90）、快照一致性（比例+状态同 sequence）、二元投票词汇与幂等 requestId、fail-safe 校验。
- 正确 UI（mock 数据）：面板四区（今日梁案 / 夯比例·梁子·梁气环·拉比例 / 夯拉双按钮 / 香火·香客），具象 LiangAvatar 六态原创 SVG，LiangQiRing 整合 `N 炷 · 再 X Token`，键盘/Escape/焦点管理/reduced-motion/明暗主题。
- P0 测试矩阵 125 项（Token 边界、库存、重复/混投、阈值、全局/个人解耦、阈值穿越、零票、非法输入、UI 结构）。

骨架里程碑(不含正式功能):

- 可安装的 DSH out-of-tree bundle:`dsh.bundle`(cordis.patch.yml 插入 Host 行)+ `dsh.client`(platform web)。
- Host 半:仅一个生命周期标记 effect(激活/卸载日志),无用量观测、无存储、无路由。
- Client 半:向 `shell.overlay` 注册一个占位圆点(悬停/聚焦文案 `今日梁位`),无正式 UI。
- 分层:`shared` / `domain`(占位) / `host` / `client` / `compat/dsh`(唯一直接触碰 DSH API 的层)。
- 浏览器产物复刻树内 `clientBundle` preset 的 `window.__ModuleLoader__.load` 包装(基线 47f94385)。
- 开发环:typecheck / lint / test / build / dev profile 安装 / dump-config / WebUI 启动 / 卸载 / tarball / 干净 profile 冒烟脚本。
