#!/usr/bin/env bash
# Boot the dev profile's WebUI with the plugin loaded.
# App args after the profile flag reach the web app's own command line.
. "$(dirname "$0")/env.sh"

PORT="${LIANGBIAO_DEV_PORT:-3080}"
exec pnpm exec dsh --profile "$PROFILE" --port "$PORT"
