#!/usr/bin/env bash
# GitHub keeps README.md. npm pack/publish temporarily swaps in README.npm.md.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  prepack)
    if [[ -e .README.github.md ]]; then
      echo 'swap-readme: leftover .README.github.md; refuse to overwrite' >&2
      exit 1
    fi
    cp README.md .README.github.md
    cp docs/npm-readme.md README.md
    ;;
  postpack)
    if [[ -f .README.github.md ]]; then
      mv .README.github.md README.md
    fi
    ;;
  *)
    echo "usage: $0 prepack|postpack" >&2
    exit 1
    ;;
esac
