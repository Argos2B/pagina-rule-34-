#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR"
FRONTEND_DIR="$ROOT_DIR/frontend"

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

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

cleanup

set +e
wait "$BACKEND_PID" 2>/dev/null
BACKEND_EXIT_CODE=$?
wait "$FRONTEND_PID" 2>/dev/null
FRONTEND_EXIT_CODE=$?
set -e

if [[ "$BACKEND_EXIT_CODE" -ne 0 ]]; then
  EXIT_CODE="$BACKEND_EXIT_CODE"
elif [[ "$FRONTEND_EXIT_CODE" -ne 0 ]]; then
  EXIT_CODE="$FRONTEND_EXIT_CODE"
else
  EXIT_CODE=0
fi

exit "$EXIT_CODE"
