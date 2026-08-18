#!/usr/bin/env bash
# Install/upgrade a Liangxiang tarball without deleting the DSH storage domain.
# Works with a global `dsh` or with `npx @deepseek-ai/dsh` (no global CLI).
set -euo pipefail

TARBALL=""
PROFILE="${LIANGXIANG_PROFILE:-default}"
DSH_BIN="${LIANGXIANG_DSH_BIN:-}"
DSH_CMD=()

usage() {
  echo "usage: $0 <dsh-liangxiang-*.tgz> [--profile NAME] [--dsh dsh|npx|/path/to/dsh]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --dsh) DSH_BIN="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      [[ -z "$TARBALL" ]] || { usage; exit 2; }
      TARBALL="$1"; shift
      ;;
  esac
done

[[ -n "$TARBALL" && -f "$TARBALL" ]] || { usage; exit 2; }
command -v node >/dev/null 2>&1 || { echo "找不到 Node.js；请先安装 Node 22.19+。" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "找不到 tar。" >&2; exit 1; }

resolve_dsh() {
  local requested="${DSH_BIN}"
  if [[ "$requested" == "npx" ]]; then
    command -v npx >/dev/null 2>&1 || { echo "找不到 npx。" >&2; exit 1; }
    DSH_CMD=(npx --yes @deepseek-ai/dsh)
    return
  fi
  if [[ -n "$requested" ]]; then
    if [[ -x "$requested" ]] || command -v "$requested" >/dev/null 2>&1; then
      DSH_CMD=("$requested")
      return
    fi
    echo "找不到指定的 DSH 命令：$requested" >&2
    exit 1
  fi
  if command -v dsh >/dev/null 2>&1; then
    DSH_CMD=(dsh)
    return
  fi
  if command -v npx >/dev/null 2>&1; then
    echo "未找到全局 dsh，改用 npx --yes @deepseek-ai/dsh"
    DSH_CMD=(npx --yes @deepseek-ai/dsh)
    return
  fi
  echo "找不到 dsh。请先 npm i -g @deepseek-ai/dsh，或保证本机有 npx。" >&2
  exit 1
}

resolve_dsh

TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
EXPECTED_VERSION="$(tar -xOf "$TARBALL" package/package.json | node -e '
  const manifest = JSON.parse(require("node:fs").readFileSync(0, "utf8"))
  if (manifest.name !== "dsh-liangxiang" || typeof manifest.version !== "string") process.exit(2)
  process.stdout.write(manifest.version)
')" || { echo "不是有效的 dsh-liangxiang 分发包：$TARBALL" >&2; exit 2; }
if [[ -z "${DSH_HOME:-}" ]]; then
  echo "DSH_HOME 未设置；请先指向正在使用的 DSH 数据目录，避免更新错误的 profile。" >&2
  echo "常见日常目录：export DSH_HOME=\"\$HOME/.dsh\"" >&2
  exit 2
fi

STORAGE_ROOT="$DSH_HOME/storages"
BACKUP_ROOT="$DSH_HOME/backups/liangxiang"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
INSTALLED_MANIFEST="$PROFILE_DIR/node_modules/dsh-liangxiang/package.json"
PACKAGE_CACHE="$DSH_HOME/packages/liangxiang"
storage_snapshot() {
  local name path
  for name in liangxiang.json liangxiang_local.json; do
    path="$STORAGE_ROOT/$name"
    if [[ -f "$path" ]]; then
      echo "$name:$(cksum "$path")"
    else
      echo "$name:missing"
    fi
  done
}

BEFORE="$(storage_snapshot)"
STORAGE_FOUND=0
BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
for STORAGE_NAME in liangxiang.json liangxiang_local.json; do
  STORAGE="$STORAGE_ROOT/$STORAGE_NAME"
  [[ -f "$STORAGE" ]] || continue
  STORAGE_FOUND=1
  mkdir -p "$BACKUP_ROOT"
  BACKUP="$BACKUP_ROOT/${STORAGE_NAME%.json}-${BACKUP_STAMP}.json"
  cp -p "$STORAGE" "$BACKUP"
  chmod 0600 "$BACKUP" 2>/dev/null || true
  echo "已备份用户数据：$BACKUP"
done
if [[ "$STORAGE_FOUND" -eq 0 ]]; then
  echo "未发现既有存储；本次将作为新安装。"
fi

echo "正在更新 profile '$PROFILE'（DSH_HOME=$DSH_HOME，命令：${DSH_CMD[*]}）..."
# pnpm keys local tarballs by dependency path as well as package version. A
# rebuilt package at the same path/version may otherwise be reported as "Already up to
# date" while stale bytes remain installed. Cache by content hash so every
# distinct artifact gets a distinct, persistent dependency path.
TARBALL_SHA="$(node -e '
  const { createHash } = require("node:crypto")
  const { readFileSync } = require("node:fs")
  process.stdout.write(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))
' "$TARBALL")"
mkdir -p "$PACKAGE_CACHE"
CACHED_TARBALL="$PACKAGE_CACHE/dsh-liangxiang-${EXPECTED_VERSION}-${TARBALL_SHA:0:16}.tgz"
install -m 0600 "$TARBALL" "$CACHED_TARBALL"
# DSH forwards this to pnpm with cwd=profile. A bare filename is treated as an
# npm package (ERR_PNPM_FETCH_404). file: + absolute path always stays local.
"${DSH_CMD[@]}" plugin --profile "$PROFILE" add "file:${CACHED_TARBALL}"
INSTALLED_VERSION="$(node -e '
  const manifest = require(process.argv[1])
  if (manifest.name !== "dsh-liangxiang" || typeof manifest.version !== "string") process.exit(2)
  process.stdout.write(manifest.version)
' "$INSTALLED_MANIFEST" 2>/dev/null)" || {
  echo "更新后未发现已安装的 dsh-liangxiang" >&2
  exit 1
}
[[ "$INSTALLED_VERSION" == "$EXPECTED_VERSION" ]] || {
  echo "版本校验失败：期望 ${EXPECTED_VERSION}，实际 ${INSTALLED_VERSION}" >&2
  exit 1
}
node "$(cd "$(dirname "$0")" && pwd)/assert-profile-modules.mjs" "$PROFILE_DIR"

AFTER="$(storage_snapshot)"
if [[ "$BEFORE" != "$AFTER" ]]; then
  echo "警告：安装过程改变了用户存储；已保留更新前备份，请停止启动并核查。" >&2
  exit 1
fi

echo "更新完成：dsh-liangxiang@${INSTALLED_VERSION}；身份、香火水位和浏览器偏好未被删除。"
echo "请重启该 DSH WebUI；版本升级后浏览器刷新一次，以加载新的前端 bundle。"
