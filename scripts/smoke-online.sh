#!/usr/bin/env bash
# Online (DEV_STAGING_ONLY) smoke test on localhost:
#
#   backend (node:sqlite) <- DSH host plugin <- /liangxiang/api/* <- curl
#
# Proves the whole chain without a browser: bootstrap, token claim, one vote
# through the HOST route (the same path the panel uses), the authoritative
# balance moving, idempotent retry, and the published snapshot appearing only
# after the cadence. Everything runs against a throwaway DB and profile.
. "$(dirname "$0")/env.sh"

BACKEND_PORT="${LIANGXIANG_SMOKE_BACKEND_PORT:-4181}"
WEB_PORT="${LIANGXIANG_SMOKE_ONLINE_PORT:-3982}"
ONLINE_PROFILE="${LIANGXIANG_SMOKE_ONLINE_PROFILE:-liangxiang-online-smoke}"
DB_FILE="$(mktemp -d)/smoke.sqlite"
BACKEND_LOG="$(mktemp)"
WEB_LOG="$(mktemp)"
BACKEND_PID=""
WEB_PID=""

cleanup() {
  # Never `wait` here: the long-running servers below are background jobs too.
  if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "$WEB_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$WEB_PID" 2>/dev/null || true
  fi
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  rm -rf "${DSH_HOME:?}/profiles/$ONLINE_PROFILE"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $1" >&2
  echo "--- backend log ---" >&2; tail -20 "$BACKEND_LOG" >&2 || true
  echo "--- webui log ---" >&2; tail -20 "$WEB_LOG" >&2 || true
  exit 1
}

wait_for() { # url, label
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$1" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  fail "$2 did not come up at $1"
}

json_field() { # json, jq-ish path via node
  node -e '
    const [payload, path] = process.argv.slice(1)
    let value = JSON.parse(payload)
    for (const key of path.split(".")) value = value?.[key]
    process.stdout.write(String(value))
  ' "$1" "$2"
}

echo "== build =="
pnpm run build >/dev/null

echo "== create isolated online-smoke profile =="
rm -rf "${DSH_HOME:?}/profiles/$ONLINE_PROFILE"
dsh_cli plugin --profile "$ONLINE_PROFILE" add "$WEB_APP_SPEC" >/dev/null
dsh_cli plugin --profile "$ONLINE_PROFILE" add . >/dev/null
pnpm --dir "$DSH_HOME/profiles/$ONLINE_PROFILE" remove "${WEB_APP_SPEC%@*}" >/dev/null
node "$REPO_ROOT/scripts/assert-profile-modules.mjs" "$DSH_HOME/profiles/$ONLINE_PROFILE"

echo "== start backend on :$BACKEND_PORT (db=$DB_FILE) =="
LIANGXIANG_BACKEND_PORT="$BACKEND_PORT" \
LIANGXIANG_BACKEND_DB="$DB_FILE" \
LIANGXIANG_SNAPSHOT_SECONDS=5 \
LIANGXIANG_TOKEN_PER_INCENSE=50000 \
LIANGXIANG_ALLOW_UNSIGNED=1 \
  node lib/backend.js >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
disown "$BACKEND_PID" 2>/dev/null || true
wait_for "http://127.0.0.1:$BACKEND_PORT/v1/health" "backend"

HEALTH="$(curl -fsS "http://127.0.0.1:$BACKEND_PORT/v1/health")"
MODE="$(json_field "$HEALTH" authority_mode)"
[ "$MODE" = "DEV_STAGING_ONLY" ] || fail "unexpected authority mode: $MODE"
echo "backend authority_mode=$MODE"

echo "== issue isolated admission ticket =="
LIANGXIANG_BACKEND_DB="$DB_FILE" \
  node lib/backend-cli.js admission issue 1 --claims 1 --ttl-hours 1 >/dev/null
echo "admission ticket ready"

echo "== refuse VERIFIED_PRODUCTION =="
if LIANGXIANG_AUTHORITY_MODE=VERIFIED_PRODUCTION LIANGXIANG_BACKEND_PORT=0 node lib/backend.js >/dev/null 2>&1; then
  fail "backend booted in VERIFIED_PRODUCTION (Decision Gate A3 must block it)"
fi
echo "blocked as expected"

echo "== start DSH WebUI on :$WEB_PORT with the online host half =="
LIANGXIANG_BACKEND_URL="http://127.0.0.1:$BACKEND_PORT" \
LIANGXIANG_SNAPSHOT_SECONDS=5 \
  pnpm exec dsh --profile "$ONLINE_PROFILE" --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
WEB_PID=$!
disown "$WEB_PID" 2>/dev/null || true
wait_for "http://127.0.0.1:$WEB_PORT/liangxiang/api/state" "host api"

STATE="$(curl -fsS "http://127.0.0.1:$WEB_PORT/liangxiang/api/state")"
HOST_MODE="$(json_field "$STATE" authorityMode)"
[ "$HOST_MODE" = "DEV_STAGING_ONLY" ] || fail "host reports $HOST_MODE, expected DEV_STAGING_ONLY"
CASE_ID="$(json_field "$STATE" activeCase.id)"
echo "host authority_mode=$HOST_MODE case=$CASE_ID"

# The smoke installation claims tokens directly against the backend: a real
# session would earn them through DSH usage observation, which needs a model
# call. This is the same endpoint the host uses, with its own installation id.
SMOKE_INSTALL="inst-smoke-online-01"
echo "== claim 150k tokens for $SMOKE_INSTALL =="
BUSINESS_DATE="$(json_field "$HEALTH" business_date)"
CLAIM="$(curl -fsS -X POST "http://127.0.0.1:$BACKEND_PORT/v1/token-claims" \
  -H 'content-type: application/json' \
  -H "x-liangxiang-installation: $SMOKE_INSTALL" \
  -d "{\"claimed_effective_tokens\":150000,\"claim_business_date\":\"$BUSINESS_DATE\"}")"
REMAINING="$(json_field "$CLAIM" authoritative_personal_state.remaining_incense)"
[ "$REMAINING" = "3" ] || fail "expected 3 incense after a 150k claim, got $REMAINING"
echo "remaining_incense=$REMAINING"

echo "== vote twice (same request id) =="
VOTE_BODY="{\"case_id\":\"$CASE_ID\",\"vote_type\":\"up\",\"request_id\":\"req-smoke-000001\"}"
V1="$(curl -fsS -X POST "http://127.0.0.1:$BACKEND_PORT/v1/votes" \
  -H 'content-type: application/json' -H "x-liangxiang-installation: $SMOKE_INSTALL" -d "$VOTE_BODY")"
V2="$(curl -fsS -X POST "http://127.0.0.1:$BACKEND_PORT/v1/votes" \
  -H 'content-type: application/json' -H "x-liangxiang-installation: $SMOKE_INSTALL" -d "$VOTE_BODY")"
[ "$(json_field "$V1" result.status)" = "accepted" ] || fail "first vote not accepted"
[ "$(json_field "$V2" result.replayed)" = "true" ] || fail "retry was not treated as a replay"
USED="$(json_field "$V2" authoritative_personal_state.used_incense)"
[ "$USED" = "1" ] || fail "idempotent retry spent twice (used=$USED)"
echo "used_incense=$USED after one intent submitted twice"

echo "== concurrent overspend guard (remaining=1, 50 parallel requests) =="
curl -fsS -X POST "http://127.0.0.1:$BACKEND_PORT/v1/token-claims" \
  -H 'content-type: application/json' -H "x-liangxiang-installation: inst-smoke-race-01" \
  -d "{\"claimed_effective_tokens\":50000,\"claim_business_date\":\"$BUSINESS_DATE\"}" >/dev/null
RACE_CODES="$(mktemp)"
RACE_PIDS=()
for i in $(seq 1 50); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://127.0.0.1:$BACKEND_PORT/v1/votes" \
    -H 'content-type: application/json' -H 'x-liangxiang-installation: inst-smoke-race-01' \
    -d "{\"case_id\":\"$CASE_ID\",\"vote_type\":\"up\",\"request_id\":\"req-smoke-race-$(printf '%03d' "$i")\"}" \
    >>"$RACE_CODES" &
  RACE_PIDS+=("$!")
done
# Wait for the curls ONLY — the servers are background jobs of this shell too.
for pid in "${RACE_PIDS[@]}"; do wait "$pid" || true; done
ACCEPTED="$(grep -c '^200$' "$RACE_CODES" || true)"
[ "$ACCEPTED" = "1" ] || fail "expected exactly 1 accepted vote under contention, got $ACCEPTED"
echo "accepted=$ACCEPTED of 50 concurrent requests"

echo "== published snapshot appears at the cadence =="
sleep 6
SNAPSHOT="$(curl -fsS "http://127.0.0.1:$BACKEND_PORT/v1/snapshot")"
TOTAL="$(json_field "$SNAPSHOT" global_snapshot.total_incense)"
STATE_NAME="$(json_field "$SNAPSHOT" global_snapshot.liangzi_state)"
SEQUENCE="$(json_field "$SNAPSHOT" global_snapshot.sequence)"
[ "$TOTAL" = "2" ] || fail "expected 2 accepted votes in the published snapshot, got $TOTAL"
echo "snapshot sequence=$SEQUENCE total_incense=$TOTAL liangzi_state=$STATE_NAME"

echo
echo "OK: online DEV_STAGING_ONLY loop verified on localhost."
echo "    (soft trust: pseudonymous installation ids, unverifiable Token claims)"
