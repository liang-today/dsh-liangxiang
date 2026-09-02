#!/usr/bin/env bash
# Compatibility command retained for developers who learned the old recovery
# flow. DSH alpha.5 now reads v3/v4/v5 caches and backs up invalid derived
# records itself, so Liangxiang deliberately moves nothing.
. "$(dirname "$0")/env.sh"

echo "DSH 0.1.2-alpha.5 now repairs compatible session projection caches during startup."
echo "No cache, session, profile, or Liangxiang ledger was moved."
echo "Run: pnpm run dev:install && pnpm run dev:web"
