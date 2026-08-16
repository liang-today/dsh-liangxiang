#!/usr/bin/env bash
# Verify the staging backend is running the current checkout. Exits 0 when the
# server's VERSION file matches local `git rev-parse --short HEAD`, 1 otherwise.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${LIANGBIAO_DEPLOY_SSH:-root@203.0.113.11}"
PREFIX="${LIANGBIAO_PREFIX:-/opt/liangbiao}"

cd "$ROOT"
LOCAL="$(git rev-parse --short HEAD)"
REMOTE_VERSION="$(ssh "$REMOTE" "cat '$PREFIX/VERSION' 2>/dev/null" || true)"

echo "local : ${LOCAL}"
echo "server: ${REMOTE_VERSION:-<missing>}"

case "$REMOTE_VERSION" in
  "$LOCAL"*)
    echo "OK: server matches local checkout."
    exit 0
    ;;
  *)
    echo "STALE: server does not match local checkout. Run scripts/deploy.sh." >&2
    exit 1
    ;;
esac
