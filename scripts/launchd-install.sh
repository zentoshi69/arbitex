#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.arbitex.dev"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$AGENTS_DIR/${LABEL}.plist"

mkdir -p "$AGENTS_DIR" "$ROOT/.logs" "$ROOT/.run"

cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>WorkingDirectory</key>
    <string>${ROOT}</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${ROOT}/scripts/run-arbitex-fast.sh</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${ROOT}/.logs/launchd.out.log</string>
    <key>StandardErrorPath</key>
    <string>${ROOT}/.logs/launchd.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
      <key>PNPM_HOME</key>
      <string>${HOME}/.local/share/pnpm</string>
    </dict>
  </dict>
</plist>
EOF

echo "→ Installed LaunchAgent plist:"
echo "  $PLIST_PATH"

if launchctl list | grep -q "${LABEL}"; then
  echo "→ Unloading existing agent (if any)"
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
fi

echo "→ Loading agent"
launchctl load "$PLIST_PATH"

echo "✅ Done"
echo "Controls:"
echo "  launchctl list | grep ${LABEL}"
echo "  launchctl start ${LABEL}"
echo "  launchctl stop  ${LABEL}"
echo "Logs:"
echo "  $ROOT/.logs/launchd.out.log"
echo "  $ROOT/.logs/launchd.err.log"

