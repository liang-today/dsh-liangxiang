# Sourced by deploy.sh / deploy-check.sh. Never bake a production host into git.
# Requires ROOT. Sets REMOTE from LIANGXIANG_DEPLOY_SSH or a gitignored .env.

if [[ -z "${LIANGXIANG_DEPLOY_SSH:-}" && -f "$ROOT/.env" ]]; then
  _deploy_ssh_line="$(
    awk '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*LIANGXIANG_DEPLOY_SSH=/ {
        line = $0
        sub(/^[[:space:]]*LIANGXIANG_DEPLOY_SSH=/, "", line)
        print line
        exit
      }
    ' "$ROOT/.env"
  )"
  _deploy_ssh_line="${_deploy_ssh_line%$'\r'}"
  if [[ "$_deploy_ssh_line" == \"*\" && "$_deploy_ssh_line" == *\" ]]; then
    _deploy_ssh_line="${_deploy_ssh_line:1:${#_deploy_ssh_line}-2}"
  elif [[ "$_deploy_ssh_line" == \'*\' && "$_deploy_ssh_line" == *\' ]]; then
    _deploy_ssh_line="${_deploy_ssh_line:1:${#_deploy_ssh_line}-2}"
  fi
  if [[ -n "$_deploy_ssh_line" ]]; then
    LIANGXIANG_DEPLOY_SSH="$_deploy_ssh_line"
  fi
  unset _deploy_ssh_line
fi

if [[ -z "${LIANGXIANG_DEPLOY_SSH:-}" ]]; then
  echo "refusing deploy: set LIANGXIANG_DEPLOY_SSH=user@host in the environment or gitignored .env" >&2
  exit 1
fi

REMOTE="$LIANGXIANG_DEPLOY_SSH"
