#!/usr/bin/env bash
# Local install that cannot be mistaken for an npm package name.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
TARBALL="$ROOT/dsh-liangxiang-0.8.3-beta.tgz"
PROFILE="${1:-web}"
export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
[[ -f "$TARBALL" ]] || { echo "找不到 $TARBALL" >&2; exit 1; }
if command -v dsh >/dev/null 2>&1; then
  DSH=(dsh)
else
  DSH=(npx --yes @deepseek-ai/dsh)
fi
echo "DSH_HOME=$DSH_HOME"
echo "安装：file:${TARBALL}"
"${DSH[@]}" plugin --profile "$PROFILE" add "file:${TARBALL}"
echo "完成。请重新启动 WebUI（dsh web 或 npx --yes @deepseek-ai/dsh web），并刷新浏览器。"
