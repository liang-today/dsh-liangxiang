# Shared prologue for all dev scripts. Sourced, not executed.
#
# Isolation: everything (profiles, storages, settings) lives under a
# project-local DSH home so the developer's real ~/.dsh is never touched.
# Override with DSH_HOME in the environment or .env (never commit .env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

export DSH_HOME="${DSH_HOME:-$REPO_ROOT/.dsh-home}"
PROFILE="${LIANGXIANG_PROFILE:-liangxiang-dev}"
WEB_APP_SPEC="${LIANGXIANG_WEB_APP_SPEC:-@deepseek-ai/dsh-web-app@0.1.2-alpha.4}"

pnpm_cli() {
  command pnpm "$@"
}

dsh_cli() {
  pnpm_cli exec dsh "$@"
}
