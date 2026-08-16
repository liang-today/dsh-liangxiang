#!/usr/bin/env bash
# Remove dsh-liangbiao from the dev profile (dependency + bundle layer).
. "$(dirname "$0")/env.sh"

dsh_cli plugin --profile "$PROFILE" remove dsh-liangbiao

echo
echo "== dump-config layer check (expect no dsh-liangbiao) =="
if dsh_cli --profile "$PROFILE" --dump-config | grep -n "dsh-liangbiao"; then
  echo "ERROR: dsh-liangbiao still present after removal" >&2
  exit 1
fi
echo "OK: dsh-liangbiao removed from profile '$PROFILE'."
