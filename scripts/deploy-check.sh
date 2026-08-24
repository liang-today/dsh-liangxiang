#!/usr/bin/env bash
# Verify the staging backend is running the current checkout. Exits 0 when the
# server's VERSION file matches local `git rev-parse --short HEAD`, 1 otherwise.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=load-deploy-ssh.sh
source "$ROOT/scripts/load-deploy-ssh.sh"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"

cd "$ROOT"
LOCAL="$(git rev-parse --short HEAD)"
REMOTE_VERSION="$(ssh "$REMOTE" "sudo -n cat '$PREFIX/VERSION' 2>/dev/null" || true)"

echo "local : ${LOCAL}"
echo "server: ${REMOTE_VERSION:-<missing>}"

if [[ "$REMOTE_VERSION" == *"$LOCAL"* ]]; then
  ssh "$REMOTE" "sudo -n systemctl is-active --quiet liangxiang-backend"
  echo "OK: server matches local checkout and liangxiang-backend is active."
  exit 0
fi
echo "STALE: server does not match local checkout. Run scripts/deploy.sh." >&2
exit 1
