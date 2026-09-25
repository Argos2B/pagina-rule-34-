#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if (( BASH_VERSINFO[0] < 5 )); then
  echo "Este script requiere Bash 5 o superior."
  exit 1
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
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

BACKEND_EXIT_CODE=""
FRONTEND_EXIT_CODE=""

set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID"
FIRST_EXIT_CODE=$?
set -e

if ! kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; then
  BACKEND_EXIT_CODE="$FIRST_EXIT_CODE"
elif ! kill -0 "$FRONTEND_PID" 2>/dev/null && kill -0 "$BACKEND_PID" 2>/dev/null; then
  FRONTEND_EXIT_CODE="$FIRST_EXIT_CODE"
fi

cleanup

set +e
if [[ -z "$BACKEND_EXIT_CODE" ]]; then
  wait "$BACKEND_PID" 2>/dev/null
  BACKEND_EXIT_CODE=$?
fi
if [[ -z "$FRONTEND_EXIT_CODE" ]]; then
  wait "$FRONTEND_PID" 2>/dev/null
  FRONTEND_EXIT_CODE=$?
fi
set -e

if [[ "$FIRST_EXIT_CODE" -ne 0 ]]; then
  EXIT_CODE="$FIRST_EXIT_CODE"
elif [[ "$BACKEND_EXIT_CODE" -ne 0 ]]; then
  EXIT_CODE="$BACKEND_EXIT_CODE"
elif [[ "$FRONTEND_EXIT_CODE" -ne 0 ]]; then
  EXIT_CODE="$FRONTEND_EXIT_CODE"
else
  EXIT_CODE=0
fi

exit "$EXIT_CODE"
