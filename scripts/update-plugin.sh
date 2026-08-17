#!/usr/bin/env bash
# Install/upgrade a Liangxiang tarball without deleting the DSH storage domain.
set -euo pipefail

TARBALL=""
PROFILE="${LIANGXIANG_PROFILE:-default}"
DSH_BIN="${LIANGXIANG_DSH_BIN:-dsh}"

usage() {
  echo "usage: $0 <dsh-liangxiang-*.tgz> [--profile NAME] [--dsh /path/to/dsh]" >&2
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
command -v "$DSH_BIN" >/dev/null 2>&1 || { echo "DSH command not found: $DSH_BIN" >&2; exit 1; }

TARBALL="$(cd "$(dirname "$TARBALL")" && pwd)/$(basename "$TARBALL")"
if [[ -z "${DSH_HOME:-}" ]]; then
  echo "DSH_HOME 未设置；请先指向正在使用的 DSH 数据目录，避免更新错误的 profile。" >&2
  exit 2
fi

STORAGE="$DSH_HOME/storages/liangxiang.json"
BACKUP_ROOT="$DSH_HOME/backups/liangxiang"
BEFORE="missing"
if [[ -f "$STORAGE" ]]; then
  mkdir -p "$BACKUP_ROOT"
  BACKUP="$BACKUP_ROOT/liangxiang-$(date -u +%Y%m%dT%H%M%SZ).json"
  cp -p "$STORAGE" "$BACKUP"
  chmod 0600 "$BACKUP" 2>/dev/null || true
  BEFORE="$(cksum "$STORAGE")"
  echo "已备份用户数据：$BACKUP"
else
  echo "未发现既有存储；本次将作为新安装。"
fi

echo "正在更新 profile '$PROFILE' ..."
"$DSH_BIN" plugin --profile "$PROFILE" add "$TARBALL"
"$DSH_BIN" --profile "$PROFILE" --dump-config | grep -q 'dsh-liangxiang' || {
  echo "更新后配置中未发现 dsh-liangxiang" >&2
  exit 1
}

AFTER="missing"
[[ -f "$STORAGE" ]] && AFTER="$(cksum "$STORAGE")"
if [[ "$BEFORE" != "$AFTER" ]]; then
  echo "警告：安装过程改变了用户存储；已保留更新前备份，请停止启动并核查。" >&2
  exit 1
fi

echo "更新完成，身份、香火水位和浏览器偏好未被删除。"
echo "请重启该 DSH WebUI；版本升级后浏览器刷新一次，以加载新的前端 bundle。"
