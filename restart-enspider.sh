#!/usr/bin/env bash
set -e

APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ">>> Entering $APP_DIR"
cd "$APP_DIR"

echo ">>> Pulling latest code..."
git pull

echo ">>> Installing dependencies..."
npm install

echo ">>> Building project..."
npm run build

echo ">>> Restarting server..."
PIDS=$(ps aux | grep "[n]ode dist/server/index.js" | awk '{print $2}')
if [ -n "$PIDS" ]; then
  echo "Found existing server PIDs: $PIDS, killing..."
  kill $PIDS || true
  sleep 2
fi

nohup node dist/server/index.js > server.log 2>&1 &
echo "Server restarted with PID $!"

