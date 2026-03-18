#!/usr/bin/env bash
# Manage ArbitEx as a background process (start/stop/restart/status/logs).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROOT/.run"
LOG_DIR="$ROOT/.logs"
PID_FILE="$PID_DIR/arbitex.pid"
OUT_LOG="$LOG_DIR/arbitex.out.log"
ERR_LOG="$LOG_DIR/arbitex.err.log"

mkdir -p "$PID_DIR" "$LOG_DIR"

is_running() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start() {
  if is_running; then
    echo "ArbitEx already running (pid $(cat "$PID_FILE"))."
    exit 0
  fi

echo "→ Starting ArbitEx in background"
  # Use fast runner by default for quick restarts. You can change to run-arbitex.sh if you want full bootstrap.
  (cd "$ROOT" && nohup bash "$ROOT/scripts/run-arbitex-fast.sh" >"$OUT_LOG" 2>"$ERR_LOG" & echo $! >"$PID_FILE")
  sleep 0.3
  if is_running; then
    echo "✅ Running (pid $(cat "$PID_FILE"))"
    echo "Logs: $OUT_LOG  |  $ERR_LOG"
  else
    echo "❌ Failed to start. Check logs:"
    echo "  $OUT_LOG"
    echo "  $ERR_LOG"
    exit 1
  fi
}

stop() {
  if ! is_running; then
    echo "ArbitEx not running."
    rm -f "$PID_FILE" 2>/dev/null || true
    exit 0
  fi

  local pid
  pid="$(cat "$PID_FILE")"
  echo "→ Stopping ArbitEx (pid $pid)"
  kill "$pid" 2>/dev/null || true

  for _ in {1..30}; do
    if kill -0 "$pid" 2>/dev/null; then
      sleep 0.2
    else
      rm -f "$PID_FILE" 2>/dev/null || true
      echo "✅ Stopped"
      exit 0
    fi
  done

  echo "→ Force killing (pid $pid)"
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE" 2>/dev/null || true
  echo "✅ Stopped"
}

status() {
  if is_running; then
    echo "✅ Running (pid $(cat "$PID_FILE"))"
  else
    echo "⏸ Not running"
  fi
  echo "Logs: $OUT_LOG  |  $ERR_LOG"
}

logs() {
  echo "== stdout =="
  if [[ -f "$OUT_LOG" ]]; then
    tail -n 200 "$OUT_LOG" || true
  else
    echo "(no log yet)"
  fi
  echo
  echo "== stderr =="
  if [[ -f "$ERR_LOG" ]]; then
    tail -n 200 "$ERR_LOG" || true
  else
    echo "(no log yet)"
  fi
}

cmd="${1:-}"
case "$cmd" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) logs ;;
  *) echo "Usage: $0 {start|stop|restart|status|logs}" ; exit 2 ;;
esac

