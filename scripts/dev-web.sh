#!/usr/bin/env bash
# Boot the dev profile's WebUI with the plugin loaded.
# App args after the profile flag reach the web app's own command line.
#
# A leftover `pnpm run dev:web` keeps 3080. A second start is handled before
# DSH boots. Projection-cache schema drift is also diagnosed before the plugin
# loader can bury it in a generic "plugin tree failed to load" traceback.
. "$(dirname "$0")/env.sh"

PORT="${LIANGXIANG_DEV_PORT:-3080}"
HOST="${LIANGXIANG_DEV_HOST:-127.0.0.1}"
RESTART="${LIANGXIANG_DEV_RESTART:-}"

listener_pids() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true
}

process_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

is_our_dsh() {
  local cmd
  cmd="$(process_command "$1")"
  case "$cmd" in
    *"--profile ${PROFILE}"*|*"--profile=${PROFILE}"*)
      case "$cmd" in
        *dsh*) return 0 ;;
      esac
      ;;
  esac
  return 1
}

wait_port_free() {
  local leftover i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    leftover="$(listener_pids)"
    if [ -z "$leftover" ]; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

stop_our_listeners() {
  local pid ppid parent leftover
  for pid in $1; do
    if ! is_our_dsh "$pid"; then
      echo "Refusing to kill pid $pid on ${HOST}:${PORT} (not ${PROFILE} dsh): $(process_command "$pid")" >&2
      exit 1
    fi
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
    echo "Stopping leftover WebUI pid $pid ($(process_command "$pid"))"
    kill "$pid" 2>/dev/null || true
    if [ -n "${ppid:-}" ] && [ "$ppid" != 1 ]; then
      parent="$(process_command "$ppid")"
      case "$parent" in
        *pnpm*"dsh"*|*"exec dsh"*)
          kill "$ppid" 2>/dev/null || true
          ;;
      esac
    fi
  done
  if wait_port_free; then
    return 0
  fi
  leftover="$(listener_pids)"
  echo "Port ${HOST}:${PORT} still busy after SIGTERM; sending KILL to: $leftover" >&2
  for pid in $leftover; do
    if is_our_dsh "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  if ! wait_port_free; then
    echo "Could not free ${HOST}:${PORT}." >&2
    exit 1
  fi
}

describe_running() {
  local pid="$1"
  local etime
  etime="$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ')"
  echo "${PORT} 已被占用，不是梁相插件加载失败。"
  echo "A ${PROFILE} WebUI is already running (pid ${pid}${etime:+, up ${etime}})."
  echo "Open http://${HOST}:${PORT}"
  echo "Replace this process: LIANGXIANG_DEV_RESTART=1 pnpm run dev:web"
  echo "Use another port:     LIANGXIANG_DEV_PORT=3081 pnpm run dev:web"
}

PIDS="$(listener_pids)"
if [ -n "$PIDS" ]; then
  OUR=""
  FOREIGN=""
  for pid in $PIDS; do
    if is_our_dsh "$pid"; then
      OUR="${OUR:+$OUR }$pid"
    else
      FOREIGN="${FOREIGN:+$FOREIGN }$pid"
    fi
  done
  if [ -n "$FOREIGN" ]; then
    echo "Port ${HOST}:${PORT} is already in use — this is not a plugin load failure." >&2
    for pid in $FOREIGN; do
      echo "  pid $pid  $(process_command "$pid")" >&2
    done
    echo "Pick a free port: LIANGXIANG_DEV_PORT=3081 pnpm run dev:web" >&2
    exit 1
  fi
  if [ -n "$RESTART" ]; then
    stop_our_listeners "$OUR"
  else
    # One leftover is the common case; print the first pid.
    describe_running "${OUR%% *}"
    exit 0
  fi
fi

node "$REPO_ROOT/scripts/check-dsh-runtime.mjs" --launch-only
node "$REPO_ROOT/scripts/check-dev-projection-cache.mjs" "$DSH_HOME"
node "$REPO_ROOT/scripts/check-dev-profile-compat.mjs" "$DSH_HOME" "$PROFILE"

exec pnpm exec dsh --profile "$PROFILE" --port "$PORT" "$@"
