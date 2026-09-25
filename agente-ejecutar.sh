#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR"
FRONTEND_DIR="$ROOT_DIR/frontend"

if (( BASH_VERSINFO[0] < 4 )) || (( BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] < 3 )); then
  echo "Este script requiere Bash 4.3+."
  exit 1
fi

if command -v setsid >/dev/null 2>&1; then
  SETSID_AVAILABLE=1
else
  SETSID_AVAILABLE=0
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    if [[ "$SETSID_AVAILABLE" -eq 1 ]]; then
      kill -- "-$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null || true
    else
      kill "$BACKEND_PID" 2>/dev/null || true
    fi
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    if [[ "$SETSID_AVAILABLE" -eq 1 ]]; then
      kill -- "-$FRONTEND_PID" 2>/dev/null || kill "$FRONTEND_PID" 2>/dev/null || true
    else
      kill "$FRONTEND_PID" 2>/dev/null || true
    fi
  fi
}

trap cleanup EXIT INT TERM

echo "Iniciando backend..."
if [[ "$SETSID_AVAILABLE" -eq 1 ]]; then
  setsid bash -c "cd \"$BACKEND_DIR\" && python manage.py runserver" &
else
  bash -c "cd \"$BACKEND_DIR\" && python manage.py runserver" &
fi
BACKEND_PID=$!

echo "Iniciando frontend..."
if [[ "$SETSID_AVAILABLE" -eq 1 ]]; then
  setsid bash -c "cd \"$FRONTEND_DIR\" && npm run dev" &
else
  bash -c "cd \"$FRONTEND_DIR\" && npm run dev" &
fi
FRONTEND_PID=$!

set +e
wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE=$?
set -e
cleanup
wait "$BACKEND_PID" 2>/dev/null || true
wait "$FRONTEND_PID" 2>/dev/null || true
exit "$EXIT_CODE"
