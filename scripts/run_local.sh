#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="$ROOT_DIR/www"
WORKER_DIR="$ROOT_DIR/cloud-run-worker"
CONFIG_FILE="$WWW_DIR/config.env"
WEB_PORT="${WEB_PORT:-3000}"
WORKER_PORT="${WORKER_PORT:-8080}"

worker_pid=""
web_pid=""

cleanup() {
  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE" >&2
  echo "Create it first:" >&2
  echo "  cd $WWW_DIR && cp config.env.example config.env" >&2
  exit 1
fi

if ! grep -q '^CLOUD_EXECUTE_URL=http://127.0.0.1:' "$CONFIG_FILE"; then
  echo "Updating CLOUD_EXECUTE_URL in $CONFIG_FILE"
  if grep -q '^CLOUD_EXECUTE_URL=' "$CONFIG_FILE"; then
    sed -i.bak "s#^CLOUD_EXECUTE_URL=.*#CLOUD_EXECUTE_URL=http://127.0.0.1:${WORKER_PORT}/compute#" "$CONFIG_FILE"
  else
    printf '\nCLOUD_EXECUTE_URL=http://127.0.0.1:%s/compute\n' "$WORKER_PORT" >> "$CONFIG_FILE"
  fi
fi

mkdir -p "$ROOT_DIR/PROBLEMS" "$ROOT_DIR/SOLUTIONS"

echo "Installing worker dependencies"
(
  cd "$WORKER_DIR"
  npm install
)

echo "Installing web dependencies"
(
  cd "$WWW_DIR"
  npm install
)

echo "Starting local worker on http://127.0.0.1:${WORKER_PORT}"
(
  cd "$WORKER_DIR"
  PORT="$WORKER_PORT" WORKER_USE_GCS=false npm start
) &
worker_pid=$!

echo "Starting web app on http://127.0.0.1:${WEB_PORT}"
(
  cd "$WWW_DIR"
  npm run dev -- --hostname 127.0.0.1 --port "$WEB_PORT"
) &
web_pid=$!

echo
echo "Stackfish is starting."
echo "Web:    http://127.0.0.1:${WEB_PORT}"
echo "Worker: http://127.0.0.1:${WORKER_PORT}/compute"
echo "Press Ctrl+C to stop both."
echo

wait "$web_pid"
