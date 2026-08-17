#!/usr/bin/env bash
# Remove dsh-liangxiang from the dev profile (dependency + bundle layer).
. "$(dirname "$0")/env.sh"

dsh_cli plugin --profile "$PROFILE" remove dsh-liangxiang

echo
echo "== dump-config layer check (expect no dsh-liangxiang) =="
if dsh_cli --profile "$PROFILE" --dump-config | grep -n "dsh-liangxiang"; then
  echo "ERROR: dsh-liangxiang still present after removal" >&2
  exit 1
fi
echo "OK: dsh-liangxiang removed from profile '$PROFILE'."
