#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$APP_ROOT/.." && pwd)"

if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

cd "$APP_ROOT"

if [[ ! -f dist/server/entry.mjs ]]; then
  npm run build
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4321}"

exec node dist/server/entry.mjs
