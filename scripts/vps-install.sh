#!/usr/bin/env bash
# Install the Liangbiao backend as a systemd service on a Linux VPS.
# Community soft trust only — this does not enable VERIFIED_PRODUCTION.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${LIANGBIAO_PREFIX:-/opt/liangbiao}"
DATA="${LIANGBIAO_DATA:-/var/lib/liangbiao/data}"
ENV_FILE="${LIANGBIAO_ENV_FILE:-/etc/liangbiao.env}"
UNIT_SRC="$ROOT/deploy/liangbiao-backend.service"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 22 is required" >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm >= 10 is required (corepack enable && corepack prepare pnpm@latest --activate)" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "re-run as root (sudo bash scripts/vps-install.sh)" >&2
  exit 1
fi

id -u liangbiao >/dev/null 2>&1 || useradd --system --home /var/lib/liangbiao --create-home --shell /usr/sbin/nologin liangbiao
mkdir -p "$DATA" "$PREFIX"
rsync -a --delete --exclude .git --exclude node_modules --exclude .liangbiao-backend "$ROOT"/ "$PREFIX"/
chown -R liangbiao:liangbiao "$PREFIX" "$DATA"

echo "== build =="
sudo -u liangbiao -H bash -lc "cd '$PREFIX' && pnpm install && pnpm run build"

if [ ! -f "$ENV_FILE" ]; then
  KEY="$(openssl rand -hex 32)"
  cat >"$ENV_FILE" <<EOF
LIANGBIAO_AUTHORITY_MODE=DEV_STAGING_ONLY
LIANGBIAO_BACKEND_HOST=127.0.0.1
LIANGBIAO_BACKEND_PORT=4180
LIANGBIAO_BACKEND_DB=$DATA/liangbiao.sqlite
LIANGBIAO_BUSINESS_TZ=Asia/Shanghai
LIANGBIAO_SNAPSHOT_SECONDS=1
LIANGBIAO_TOKEN_PER_INCENSE=50000
LIANGBIAO_MAX_TOKENS_PER_MINUTE=50000
LIANGBIAO_COMMUNITY_KEY=$KEY
EOF
  chmod 640 "$ENV_FILE"
  chown root:liangbiao "$ENV_FILE"
  echo "wrote $ENV_FILE (community key generated)"
else
  echo "keeping existing $ENV_FILE"
fi

NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" "$UNIT_SRC" > /etc/systemd/system/liangbiao-backend.service
systemctl daemon-reload
systemctl enable --now liangbiao-backend
sleep 1
curl -fsS http://127.0.0.1:4180/v1/health
echo
echo "backend is up. Next: point Caddy at 127.0.0.1:4180 (see deploy/Caddyfile)."
echo "Give each Host: LIANGBIAO_BACKEND_URL=https://<your-domain> and the community key in $ENV_FILE"
echo "This is community soft trust, not verified usage voting."
