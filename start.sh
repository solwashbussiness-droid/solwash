#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"

if [ "$1" = "-d" ] || [ "$1" = "--daemon" ]; then
    echo "Starting SolWash services in background..."
    nohup node "$ROOT_DIR/start.js" > "$ROOT_DIR/solwash.log" 2>&1 &
    disown
    echo "SolWash running in background. Logs: $ROOT_DIR/solwash.log"
else
    exec node "$ROOT_DIR/start.js"
fi
