# Shared, fixed destinations for the isolated standby rehearsal only.
# This is sourced after load-deploy-target.sh; never source a remote .env.
rehearsal_validate_target() {
  if [[ "$DEPLOY_ROLE" != standby ]]; then
    echo "refusing rehearsal: only an explicitly verified standby target is allowed" >&2
    exit 1
  fi
  REHEARSAL_PREFIX=/opt/liangxiang-rehearsal
  REHEARSAL_STAGE=/var/tmp/liangxiang-rehearsal-deploy
  REHEARSAL_ENV=/etc/liangxiang-rehearsal.env
  REHEARSAL_SERVICE=liangxiang-backend-rehearsal
  REHEARSAL_DATA=/var/lib/liangxiang/rehearsal
  REHEARSAL_DB=/var/lib/liangxiang/rehearsal/liangxiang-rehearsal.sqlite
  REHEARSAL_CLOCK=/var/lib/liangxiang/rehearsal/clock.json
  REHEARSAL_PORT=4195
  REHEARSAL_SEED_MODE="${LIANGXIANG_REHEARSAL_SEED:-fresh}"
  case "$REHEARSAL_SEED_MODE" in
    fresh|standby-copy) ;;
    *) echo "refusing rehearsal: LIANGXIANG_REHEARSAL_SEED must be fresh or standby-copy" >&2; exit 1 ;;
  esac
  # Never reinterpret an inherited ordinary-service override as permission to
  # replace it. All rehearsal destinations are deliberately non-configurable.
  if [[ "${LIANGXIANG_PREFIX:-$REHEARSAL_PREFIX}" != "$REHEARSAL_PREFIX" \
    || "${LIANGXIANG_DEPLOY_STAGE:-$REHEARSAL_STAGE}" != "$REHEARSAL_STAGE" \
    || "${LIANGXIANG_REHEARSAL_ENV_FILE:-$REHEARSAL_ENV}" != "$REHEARSAL_ENV" \
    || "${LIANGXIANG_REHEARSAL_SERVICE:-$REHEARSAL_SERVICE}" != "$REHEARSAL_SERVICE" \
    || "${LIANGXIANG_REHEARSAL_DATA_DIR:-$REHEARSAL_DATA}" != "$REHEARSAL_DATA" \
    || "${LIANGXIANG_REHEARSAL_DB:-$REHEARSAL_DB}" != "$REHEARSAL_DB" \
    || "${LIANGXIANG_REHEARSAL_CLOCK_FILE:-$REHEARSAL_CLOCK}" != "$REHEARSAL_CLOCK" \
    || "${LIANGXIANG_REHEARSAL_PORT:-$REHEARSAL_PORT}" != "$REHEARSAL_PORT" ]]; then
    echo "refusing rehearsal: destination paths, service and port are fixed" >&2
    exit 1
  fi
}

rehearsal_require_clean_checkout() {
  if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
    echo "refusing rehearsal: checkout has uncommitted changes" >&2
    exit 1
  fi
}
