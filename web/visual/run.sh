#!/usr/bin/env bash
# Starts `wrangler dev`, runs the visual check and stops the server, all in one shell command
# (some sandboxes kill background processes when the command ends).
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-8787}"
rm -rf .wrangler/state/v3/cache  # the Worker caches rendered pages locally; start clean
npx wrangler dev --port "$PORT" --log-level warn >/tmp/wrangler-dev.log 2>&1 &
WD=$!
trap 'kill $WD 2>/dev/null; pkill -P $WD 2>/dev/null; pkill -f workerd 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  curl -fs "http://localhost:$PORT/privacy" >/dev/null 2>&1 && break
  sleep 1
done
BASE="http://localhost:$PORT" node visual/check.mjs
