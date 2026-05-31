#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
python3 "$ROOT/scripts/catalyst.py" "$@"
