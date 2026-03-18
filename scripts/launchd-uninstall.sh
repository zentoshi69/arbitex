#!/usr/bin/env bash
set -euo pipefail

LABEL="com.arbitex.dev"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "$PLIST_PATH" ]]; then
  echo "→ Unloading agent"
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  echo "→ Removing plist"
  rm -f "$PLIST_PATH"
  echo "✅ Uninstalled ${LABEL}"
else
  echo "No plist found at: $PLIST_PATH"
fi

