#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if (( BASH_VERSINFO[0] < 4 )) || (( BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 3 )); then
  echo "Este script requiere Bash 4.3 o superior."
  exit 1
fi

CLEANUP_DONE=0

cleanup() {
  if [[ "$CLEANUP_DONE" -eq 1 ]]; then
    return
  fi
  CLEANUP_DONE=1

  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  set +e
  [[ -n "${BACKEND_PID:-}" ]] && wait "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && wait "$FRONTEND_PID" 2>/dev/null || true
  set -e
}

trap cleanup EXIT INT TERM

echo "Iniciando backend..."
(
  cd "$BACKEND_DIR"
  exec python manage.py runserver "${BACKEND_HOST}:${BACKEND_PORT}"
) &
BACKEND_PID=$!

echo "Iniciando frontend..."
(
  cd "$FRONTEND_DIR"
  exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

set +e
wait -n
FIRST_EXIT_CODE=$?
set -e

cleanup

exit "$FIRST_EXIT_CODE"
