#!/bin/bash
# Keeps the bot running: after /restartbot (process exit) it starts again after 3 seconds.
cd "$(dirname "$0")"
while true; do
    node .
    echo "Bot exited, restarting in 3s (Ctrl+C to stop)..."
    sleep 3
done