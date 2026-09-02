# 梁相文档导航

> Agent 先读根目录 [`AGENTS.md`](../AGENTS.md)，再读
> [`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md)。本页只决定“还需读什么”，
> 不新增产品规则。历史文档与归档输出永远不能覆盖前两者。

## 现行权威

| 文件 | 管辖范围 |
|---|---|
| [`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md) | 当前代码/仓库边界、权威流、版本矩阵、运维快照与工程门禁 |
| [`140-liangxiang-brand.md`](140-liangxiang-brand.md) | 品牌、视觉母题、用户可见文案与发布表达 |
| [`COMPATIBILITY.md`](COMPATIBILITY.md) | 已实测 DSH/Node/pnpm 基线、触点分级与升级清单 |
| [`INSTALL.md`](INSTALL.md) | 当前安装、开发与自建后端路径 |
| [`SECURITY.md`](SECURITY.md) | 当前安全边界和加固说明 |
| [`PRIVACY.md`](PRIVACY.md) | 当前数据收集、存储和删除口径 |

`AGENTS.md` 的优先级仍高于本表所有文件。上述文档发生实现变化时必须在同一改动中
更新；不能留给后续 Agent 猜测。

## 现行参考

这些文件仍随实现维护，但不是新的契约。只按当前任务选读：

- 数据流与用户操作：`DATA_FLOW.md`、`TROUBLESHOOTING.md`。
- 运维与恢复：`121-vps-deploy.md`、`122-identity-recovery.md`、
  `143-case-bank-and-operations.md`、`144-client-recovery-and-update.md`。
- 梁祠视觉/交互实现参考：`130-liangci-design.md`；契约仍只在 `AGENTS.md`。
- `npm-readme.md` 是发布 README 输入；必须由现行权威校验，不能反向定义产品。

参考文件若仍出现旧名称、旧 Phase、旧端点或“future/占位”描述，以当前源码、测试、
`AGENTS.md` 和 `CURRENT_ARCHITECTURE.md` 为准，并在相关改动中顺手修正文档。

## 历史决策记录

用于理解“为什么曾经这样决定”，不得直接照抄为当前实现：

- `000-*` 至 `076-*`：早期 DSH 调研、产品/Domain 设计、Token/Host 分阶段实现、
  Authority 决策与 Backend v1 设计。它们记录当时基线（含旧 RC 路径和旧 schema），
  当前 DSH 事实只读 `COMPATIBILITY.md`，当前 wire/schema 只读源码、迁移和测试。
- 规划、威胁/限制/测试和发布快照：`100-release-readiness.md`、
  `101-threat-model.md`、`102-known-limitations.md`、`103-test-matrix.md`、
  `110-prohibition-refresh.md`、`120-community-product.md`。
- 实施/迁移/审查报告：`141-system-test-report-v0.4.0.md`、
  `142-hk-migration-report.md`、`145-static-review-remediation.md`、`BUGFIX.md`。

其中仍有效的结论已经固化进 `AGENTS.md`、当前架构或现行专题文档；历史文件本身不
因局部正确而恢复权威身份。

## 归档输出

- `LIANGXIANG_CURSOR_MASTER_R3.md`：旧 Cursor 一体化执行包，过长且混有多代事实。
- `131-liangci-cursor-prompt.md`：一次性 Cursor 实施 Prompt。
- `PRODUCT_FREEZE_V0.1.md`、`SEMANTIC_CORRECTION_R2.md`：旧冻结/纠偏交接物；有效规则
  已进入 `AGENTS.md`。
- `assets/`：文档图片和旧设计输出，不能作为数据模型、文案或状态契约。

官网、宣传视频与 `Promo-Output` 不属于主仓文档事实源；边界见
[`CURRENT_ARCHITECTURE.md`](CURRENT_ARCHITECTURE.md)。

## Agent 最小读取法

1. 完整读 `AGENTS.md`、`CURRENT_ARCHITECTURE.md` 和本页。
2. 按任务从“现行权威/参考”选择最少的专题文件。
3. 涉及 DSH 时先读当前钉住的 `../deepseek-harness` 源码，再改 `compat/dsh`。
4. 只有追溯原因时才打开历史文件；不要把整个 `docs/` 注入上下文。
5. 发现冲突时修正当前实现或文档，并保留清晰证据；不要发明第三套折中语义。
