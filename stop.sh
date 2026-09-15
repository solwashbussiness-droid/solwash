#!/usr/bin/env bash

export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"

echo "Stopping SolWash services..."

# Kill processes on 5000, 3000, 3001
for port in 5000 3000 3001; do
    pid=$(lsof -ti :$port 2>/dev/null)
    if [ -n "$pid" ]; then
        echo " Stopping process on port $port (PID: $pid)..."
        kill -9 $pid 2>/dev/null || true
    else
        echo " No process found on port $port."
    fi
done

echo " All SolWash services stopped."
