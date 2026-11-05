#!/bin/bash
# macOS / Linux: double-click (macOS) or run ./start.command
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install the LTS version from https://nodejs.org and run this file again."
  read -n 1 -s -r -p "Press any key to close"
  exit 1
fi
node server/index.js
