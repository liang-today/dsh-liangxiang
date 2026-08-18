#!/usr/bin/env bash
# Install the Liangxiang backend as a systemd service on a Linux VPS.
# Community soft trust only — this does not enable VERIFIED_PRODUCTION.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${LIANGXIANG_PREFIX:-/opt/liangxiang}"
DATA="${LIANGXIANG_DATA:-/var/lib/liangxiang/data}"
ENV_FILE="${LIANGXIANG_ENV_FILE:-/etc/liangxiang.env}"
UNIT_SRC="$ROOT/deploy/liangxiang-backend.service"

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

id -u liangxiang >/dev/null 2>&1 || useradd --system --home /var/lib/liangxiang --create-home --shell /usr/sbin/nologin liangxiang
mkdir -p "$DATA" "$PREFIX"
rsync -a --delete --exclude .git --exclude node_modules --exclude .liangxiang-backend "$ROOT"/ "$PREFIX"/
chown -R liangxiang:liangxiang "$PREFIX" "$DATA"

echo "== build =="
sudo -u liangxiang -H bash -lc "cd '$PREFIX' && pnpm install && pnpm run build"

if [ ! -f "$ENV_FILE" ]; then
  cat >"$ENV_FILE" <<EOF
LIANGXIANG_AUTHORITY_MODE=DEV_STAGING_ONLY
LIANGXIANG_BACKEND_HOST=127.0.0.1
LIANGXIANG_BACKEND_PORT=4180
LIANGXIANG_BACKEND_DB=$DATA/liangxiang.sqlite
LIANGXIANG_BUSINESS_TZ=Asia/Shanghai
LIANGXIANG_SNAPSHOT_SECONDS=1
LIANGXIANG_TOKEN_PER_INCENSE=50000
LIANGXIANG_ADMISSION_CLAIM_RATE_LIMIT=120
LIANGXIANG_ADMISSION_TICKET_TTL_HOURS=24
LIANGXIANG_ADMISSION_TICKET_MAX_CLAIMS=1
LIANGXIANG_ADMISSION_PUBLIC_LIST_LIMIT=20
EOF
  chmod 640 "$ENV_FILE"
  chown root:liangxiang "$ENV_FILE"
  echo "wrote $ENV_FILE (ticket admission only)"
else
  echo "keeping existing $ENV_FILE"
fi

NODE_BIN="$(command -v node)"
sed "s|/usr/bin/node|$NODE_BIN|" "$UNIT_SRC" > /etc/systemd/system/liangxiang-backend.service
install -o root -g root -m 0755 "$PREFIX/scripts/liang" /usr/local/bin/liang
systemctl daemon-reload
systemctl enable --now liangxiang-backend
sleep 1
curl -fsS http://127.0.0.1:4180/v1/health
echo
echo "backend is up. Next: point Caddy at 127.0.0.1:4180 (see deploy/Caddyfile)."
echo "Admission inventory tops up to 1000 remaining claims automatically; liang tickets replenish to do it now."
echo "Give each Host only LIANGXIANG_BACKEND_URL=https://<your-domain>; new installs auto-claim a ticket."
echo "This is community soft trust, not verified usage voting."
