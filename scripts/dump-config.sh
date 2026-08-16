#!/usr/bin/env bash
# Print the dev profile's effective composed configuration (no boot).
. "$(dirname "$0")/env.sh"

dsh_cli --profile "$PROFILE" --dump-config
