---
name: liangxiang-release-notes
description: Draft or review Liangxiang user-facing update notes and run the release-copy gate before npm or GitHub publishing. Use for release preparation, version bumps, update dialogs, release notes, changelog summaries, or publish requests; do not use for internal engineering changelog entries alone.
---

# 梁相更新说明

把更新说明写成用户愿意读完的版本宣传，不写成 Commit 清单或后台施工记录。

## 取材范围

1. 先确认上一个**正式公开版本**与目标版本。
2. 汇总两次正式发布之间的全部用户可见变化，不以某个 Commit、某次对话或某一天为边界。
3. 只保留用户能感知的收益：新玩法、交互、视觉、兼容性、安装升级体验与重要社区信息。
4. 后台安全、数据库 schema/migration、幂等实现、回归测试、适配层证据、构建镜像、内部重构和排障细节不得进入客户端更新弹窗。它们可留在工程 `CHANGELOG.md`。

## 文案标准

- 主列表保持 3–4 条，每条一句，先说收益，再给必要事实。
- 合并同类变化；不要逐 Commit 罗列。
- 使用面向用户的宣传表达，避免文件名、函数名、测试名和内部版本细节。
- DSH 适配只概括为“适配 DSH 新版本，安装、升级与使用更顺畅”一类收益，不展示内部兼容性审计。
- 社群号码、邀请语与鸣谢可作为主列表后的独立短区块，不挤进技术条目。
- 不夸大尚未实现或尚未发布的能力；信任与安全表述必须符合仓库现行事实。

推荐形态：

```text
1. 送香了：新香客备 10 炷，当天重装不重复领取。
2. 倾炉动效进一步优化：长按 1.5 秒，一次打出多炷香。
3. 适配 DSH 新版本：安装、升级与使用更顺畅。
4. 新增梁相广播台：重要信息不错过～
```

示例只规定密度与语气；每次必须按上次正式版以来的真实改动重新汇总。

## 发布前门禁

在任何 npm 发布或 GitHub Release 之前：

1. 检查 `src/client/release-notes.ts` 是否覆盖上次正式版以来的关键用户收益，且主列表不超过 4 条。
2. 检查弹窗中没有后台、安全、迁移、测试或 Commit 级开发日志。
3. 检查 `RELEASE_NOTES_VERSION`、`package.json` 的 `version` 与 `PLUGIN_VERSION` 完全一致。
4. 向用户展示最终更新说明并明确提醒“更新日志已按标准检查”或指出缺项。
5. 只有用户明确许可后才执行 npm 发布或 GitHub Release；检查通过本身不构成发布授权。
